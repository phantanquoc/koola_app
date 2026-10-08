package com.chatapp

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Outline
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.animation.DecelerateInterpolator
import androidx.activity.BackEventCompat
import androidx.activity.OnBackPressedCallback
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.swmansion.rnscreens.Screen

class MainActivity : ReactActivity() {

  /** Per-card bookkeeping so we can restore the original outline state. */
  private class CardState(
      val originalProvider: ViewOutlineProvider?,
      val originalClip: Boolean,
      val originalElevation: Float,
  ) {
    var animator: ValueAnimator? = null
    /** A back was handed to JS for this card; ignore further backs until resolved. */
    var pending = false
    /** JS `beforeRemove` confirmed the pop — never restore this card. */
    var popping = false
    var pendingSince = 0L
    var watchdog: Runnable? = null
    var detachListener: View.OnAttachStateChangeListener? = null
  }

  private lateinit var backCallback: OnBackPressedCallback
  private lateinit var snapshots: BackSnapshotController
  private val mainHandler = Handler(Looper.getMainLooper())
  private val decelerate = DecelerateInterpolator()
  private val cards = HashMap<View, CardState>()
  private var maxRadiusPx = 0f
  private var maxElevationPx = 0f

  // Predictive (API 34+) gesture state.
  private var gestureActive = false
  private var gestureIgnored = false
  private var gestureCard: View? = null

  // Quick back (tap / nav button / KoolaBack.performBack) shrink in flight.
  private var quickCard: View? = null

  /** uptime of the last pending card detach (pop landed). */
  private var lastPopDetachAt = -1_000_000L

  /**
   * One shared, allocation-free outline provider: the corner radius is derived
   * from the view's current scale, so the same instance serves every frame and
   * every card. Rect is the unscaled bounds; the render node scales the outline.
   */
  private val cardOutline =
      object : ViewOutlineProvider() {
        override fun getOutline(view: View, outline: Outline) {
          val p = progressOf(view)
          // Divide by scale so the visible (post-scale) radius matches the target.
          val scale = view.scaleX.coerceAtLeast(0.01f)
          outline.setRoundRect(0, 0, view.width, view.height, maxRadiusPx * p / scale)
        }
      }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Draw content behind system bars from the very first frame.
    // This prevents the layout jump that occurs when React Native's
    // <StatusBar translucent> is applied after initial render.
    WindowCompat.setDecorFitsSystemWindows(window, false)
    super.onCreate(savedInstanceState)

    val density = resources.displayMetrics.density
    maxRadiusPx = 20f * density
    maxElevationPx = 16f * density

    snapshots = BackSnapshotController(this)
    snapshots.register()

    backCallback =
        object : OnBackPressedCallback(true) {
          override fun handleOnBackStarted(backEvent: BackEventCompat) {
            onGestureStarted(backEvent.progress)
          }

          override fun handleOnBackProgressed(backEvent: BackEventCompat) {
            if (!gestureActive) onGestureStarted(backEvent.progress) else onGestureProgress(backEvent.progress)
          }

          override fun handleOnBackCancelled() {
            onGestureCancelled()
          }

          override fun handleOnBackPressed() {
            onBackCommitted()
          }
        }
    onBackPressedDispatcher.addCallback(this, backCallback)
  }

  // ─── Back routing ────────────────────────────────────────────────────────

  /**
   * API < 33 (and any legacy caller): the back KEY arrives via
   * Activity.onKeyUp → onBackPressed(). ReactActivity overrides that to call
   * the RN delegate directly, bypassing the dispatcher (no shrink, and it
   * races the header ← path). Route it through the dispatcher instead.
   *
   * No recursion: androidx ComponentActivity's dispatcher fallback is
   * `access$onBackPressed$s…` → `invokespecial androidx.core.app
   * .ComponentActivity.onBackPressed` (verified by javap on activity-1.9.3),
   * a non-virtual call that resolves to android.app.Activity.onBackPressed —
   * it never re-enters this override.
   */
  @Deprecated("Deprecated in Java")
  @Suppress("DEPRECATION")
  override fun onBackPressed() {
    onBackPressedDispatcher.onBackPressed()
  }

  /**
   * Called by React Native when JS did not consume the back press
   * (BackHandler.exitApp → DeviceEventManager.invokeDefaultBackPressHandler).
   * The stock implementation calls super.onBackPressed(), which re-enters the
   * OnBackPressedDispatcher → our always-enabled callback → JS again: an
   * infinite loop at the root screen. Temporarily disabling our callback lets
   * the dispatcher fall through to the platform default (finish / move task
   * to back), so the root ChatHome exits normally.
   */
  override fun invokeDefaultOnBackPressed() {
    if (!::backCallback.isInitialized) {
      super.invokeDefaultOnBackPressed()
      return
    }
    backCallback.isEnabled = false
    try {
      onBackPressedDispatcher.onBackPressed()
    } finally {
      backCallback.isEnabled = true
    }
  }

  /** Always hand the press to React Native; JS decides pop vs exit. */
  private fun delegateBack() {
    try {
      reactActivityDelegate.onBackPressed()
    } catch (_: Exception) {
      invokeDefaultOnBackPressed()
    }
  }

  /** JS `beforeRemove` on ChatScreen: the pop is committed, never restore. */
  fun onJsPopping() {
    for (state in cards.values) if (state.pending) state.popping = true
  }

  private fun interceptActive(): Boolean = KoolaBackState.interceptCount > 0

  /**
   * True while a back already handed to JS for a Chat card is unresolved
   * (pop not finished, or consume not yet confirmed). Every further back is
   * swallowed so a burst pops exactly once and never reaches ChatHome's exit.
   */
  private fun hasPendingCard(): Boolean {
    // A back burst that outlives the pop (card already detached) must not
    // fall through to ChatHome's exitApp: swallow briefly after the pop lands.
    if (SystemClock.uptimeMillis() - lastPopDetachAt < POST_POP_COOLDOWN_MS) return true
    for ((card, state) in cards.entries.toList()) {
      if (!state.pending) continue
      if (!card.isAttachedToWindow) {
        clearCard(card)
        continue
      }
      return true
    }
    return false
  }

  private fun onGestureStarted(rawProgress: Float) {
    gestureActive = true
    gestureCard = null
    gestureIgnored = false
    if (quickCard != null || hasPendingCard()) {
      // A back for the current card is already in flight; swallow this one.
      gestureIgnored = true
      return
    }
    if (interceptActive()) return // JS will consume it: no visuals, delegate on commit
    val card = findTopChatCard()
    sweepStaleCards(card)
    if (card == null) return
    cancelCardAnimations(card)
    gestureCard = card
    snapshots.install(card)
    applyProgress(card, decelerate.getInterpolation(rawProgress.coerceIn(0f, 1f)))
  }

  private fun onGestureProgress(rawProgress: Float) {
    val card = gestureCard ?: return
    if (!card.isAttachedToWindow) {
      gestureCard = null
      clearCard(card)
      return
    }
    applyProgress(card, decelerate.getInterpolation(rawProgress.coerceIn(0f, 1f)))
  }

  private fun onGestureCancelled() {
    gestureActive = false
    if (gestureIgnored) {
      gestureIgnored = false
      return
    }
    val card = gestureCard ?: return
    gestureCard = null
    animateRestore(card)
  }

  private fun onBackCommitted() {
    if (gestureActive) {
      gestureActive = false
      if (gestureIgnored) {
        // Consumed: a back for this card is already pending in JS.
        gestureIgnored = false
        return
      }
      val card = gestureCard
      gestureCard = null
      if (card == null) {
        delegateBack()
        return
      }
      if (interceptActive()) {
        // An interceptor appeared mid-gesture: undo visuals, let JS consume.
        clearCard(card)
        delegateBack()
        return
      }
      if (progressOf(card) < QUICK_PROGRESS_THRESHOLD) {
        // On API 34+ a back KEY (3-button nav, adb keyevent) is also routed as
        // started → invoked with progress 0 — no real drag happened, so play
        // the quick two-phase shrink instead of popping an unshrunk card.
        startQuickShrink(card)
        return
      }
      // Release of a predictive gesture: keep the card shrunk, let JS pop once
      // and the fragment's foreground_close slide it out while still shrunk.
      markPending(card)
      delegateBack()
      return
    }

    // Quick back: tap, 3-button nav, or KoolaBack.performBack() from JS.
    if (quickCard != null || hasPendingCard()) return // consumed: already in flight
    if (interceptActive()) {
      delegateBack()
      return
    }
    val card = findTopChatCard()
    sweepStaleCards(card)
    if (card == null) {
      delegateBack()
      return
    }
    startQuickShrink(card)
  }

  /** 150ms shrink to the hold pose, then hand the press to JS (pop slides it out). */
  private fun startQuickShrink(card: View) {
    cancelCardAnimations(card)
    quickCard = card
    snapshots.install(card)
    runCardAnimator(card, progressOf(card), 1f, QUICK_MS) { cancelled ->
      if (quickCard === card) quickCard = null
      if (!cancelled) {
        if (interceptActive()) {
          clearCard(card)
          delegateBack()
          return@runCardAnimator
        }
        markPending(card)
        delegateBack()
      }
    }
  }

  // ─── Card visuals ────────────────────────────────────────────────────────

  private fun progressOf(view: View): Float = ((1f - view.scaleX) / MAX_SHRINK).coerceIn(0f, 1f)

  private fun stateFor(card: View): CardState =
      cards.getOrPut(card) { CardState(card.outlineProvider, card.clipToOutline, card.elevation) }

  private fun applyProgress(card: View, progress: Float) {
    val p = progress.coerceIn(0f, 1f)
    val state = stateFor(card)
    if (card.outlineProvider !== cardOutline) {
      card.outlineProvider = cardOutline
      card.clipToOutline = true
    }
    val scale = 1f - MAX_SHRINK * p
    card.scaleX = scale
    card.scaleY = scale
    card.elevation = maxOf(state.originalElevation, maxElevationPx * p)
    card.invalidateOutline()
  }

  /** Instantly restore the card to identity, drop its snapshot, and forget it. */
  private fun clearCard(card: View) {
    val state = cards.remove(card) ?: return
    state.animator?.let {
      state.animator = null
      it.cancel()
    }
    state.watchdog?.let {
      mainHandler.removeCallbacks(it)
      state.watchdog = null
    }
    state.detachListener?.let {
      card.removeOnAttachStateChangeListener(it)
      state.detachListener = null
    }
    if (quickCard === card) quickCard = null
    if (gestureCard === card) gestureCard = null
    snapshots.uninstall(card)
    card.scaleX = 1f
    card.scaleY = 1f
    card.outlineProvider = state.originalProvider
    card.clipToOutline = state.originalClip
    card.elevation = state.originalElevation
    card.invalidateOutline()
  }

  private fun cancelCardAnimations(card: View) {
    val state = cards[card] ?: return
    state.animator?.let {
      state.animator = null
      it.cancel()
    }
  }

  /** Reset cards left shrunk that nobody is driving any more. Pending cards stay. */
  private fun sweepStaleCards(except: View?) {
    if (cards.isEmpty()) return
    for ((card, state) in cards.entries.toList()) {
      if (card === except) continue
      if (!card.isAttachedToWindow || (state.animator == null && !state.pending)) {
        clearCard(card)
      }
    }
  }

  private fun animateRestore(card: View) {
    if (!cards.containsKey(card)) return
    runCardAnimator(card, progressOf(card), 0f, RESTORE_MS) { cancelled ->
      if (!cancelled) clearCard(card)
    }
  }

  private fun runCardAnimator(
      card: View,
      from: Float,
      to: Float,
      durationMs: Long,
      onEnd: (cancelled: Boolean) -> Unit,
  ) {
    val state = stateFor(card)
    state.animator?.let {
      state.animator = null
      it.cancel()
    }
    val animator = ValueAnimator.ofFloat(from, to)
    animator.duration = durationMs
    animator.interpolator = decelerate
    animator.addUpdateListener { applyProgress(card, it.animatedValue as Float) }
    animator.addListener(
        object : AnimatorListenerAdapter() {
          private var cancelled = false

          override fun onAnimationCancel(animation: Animator) {
            cancelled = true
          }

          override fun onAnimationEnd(animation: Animator) {
            val current = cards[card]
            if (current?.animator === animation) current.animator = null
            onEnd(cancelled)
          }
        })
    state.animator = animator
    animator.start()
  }

  // ─── Pending back resolution ─────────────────────────────────────────────

  /**
   * The back for [card] was handed to JS. Primary resolution is structural:
   * the card detaching (pop finished, fragment removed) clears it at once.
   * JS `beforeRemove` → [onJsPopping] marks it committed so it is never
   * restored. The timer is only a fallback for "JS consumed it without
   * popping" (an interceptor we were not told about): after [WATCHDOG_MS], if
   * the card is still attached, still top, and not popping → restore.
   */
  private fun markPending(card: View) {
    val state = stateFor(card)
    state.pending = true
    state.popping = false
    state.pendingSince = SystemClock.uptimeMillis()
    if (state.detachListener == null) {
      val listener =
          object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) = Unit

            override fun onViewDetachedFromWindow(v: View) {
              if (cards[v]?.pending == true) lastPopDetachAt = SystemClock.uptimeMillis()
              clearCard(v)
            }
          }
      state.detachListener = listener
      card.addOnAttachStateChangeListener(listener)
    }
    state.watchdog?.let { mainHandler.removeCallbacks(it) }
    val runnable =
        object : Runnable {
          override fun run() {
            val s = cards[card] ?: return
            if (s.watchdog !== this) return
            val elapsed = SystemClock.uptimeMillis() - s.pendingSince
            when {
              !card.isAttachedToWindow -> clearCard(card)
              elapsed >= PENDING_GIVE_UP_MS -> clearCard(card)
              !s.popping && isTopChatCard(card) -> {
                s.watchdog = null
                s.pending = false
                animateRestore(card)
              }
              else -> mainHandler.postDelayed(this, WATCHDOG_RETRY_MS)
            }
          }
        }
    state.watchdog = runnable
    mainHandler.postDelayed(runnable, WATCHDOG_MS)
  }

  // ─── Card lookup ─────────────────────────────────────────────────────────

  /** The `nativeID="chat-screen-card"` view inside the top-most screen, if any. */
  private fun findTopChatCard(): View? {
    val root = window?.decorView ?: return null
    return findCard(root)
  }

  private fun findCard(view: View): View? {
    if (view.getTag(com.facebook.react.R.id.view_tag_native_id) == NATIVE_ID &&
        isTopChatCard(view)) {
      return view
    }
    if (view is ViewGroup) {
      for (i in view.childCount - 1 downTo 0) {
        val found = findCard(view.getChildAt(i) ?: continue)
        if (found != null) return found
      }
    }
    return null
  }

  /**
   * True when the card is attached, shown, and every enclosing rnscreens
   * [Screen] is the top screen of its container (ScreenStack.topScreen is the
   * ON_TOP wrapper; ScreenContainer.topScreen is the ON_TOP tab). A screen
   * pushed over Chat (e.g. GroupInfo) or a pop in progress makes this false.
   */
  private fun isTopChatCard(card: View): Boolean {
    if (!card.isAttachedToWindow || !card.isShown) return false
    var child: View = card
    var parent: android.view.ViewParent? = card.parent
    var sawScreen = false
    while (parent is View) {
      if (child is Screen) {
        sawScreen = true
        val container = child.container
        if (container != null && container.topScreen !== child) return false
      }
      val parentView: View = parent
      child = parentView
      parent = parentView.parent
    }
    return sawScreen
  }

  override fun onDestroy() {
    for (card in cards.keys.toList()) clearCard(card)
    mainHandler.removeCallbacksAndMessages(null)
    quickCard = null
    gestureCard = null
    if (::snapshots.isInitialized) snapshots.unregister()
    super.onDestroy()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ChatApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  companion object {
    private const val NATIVE_ID = BackSnapshotController.CARD_NATIVE_ID
    private const val MAX_SHRINK = 0.08f
    private const val QUICK_MS = 150L
    private const val QUICK_PROGRESS_THRESHOLD = 0.02f
    private const val RESTORE_MS = 200L
    /** Fallback only: restore a still-top card if JS consumed the back without popping. */
    private const val WATCHDOG_MS = 1500L
    private const val WATCHDOG_RETRY_MS = 250L
    /** Hard cap: never leave a card shrunk/pending longer than this. */
    private const val PENDING_GIVE_UP_MS = 4000L
    /** Swallow trailing backs of the same burst after the pop lands. */
    private const val POST_POP_COOLDOWN_MS = 300L
  }
}
