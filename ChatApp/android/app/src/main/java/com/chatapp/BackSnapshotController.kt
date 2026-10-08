package com.chatapp

import android.graphics.Bitmap
import android.graphics.Rect
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.PixelCopy
import android.view.View
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.FragmentManager
import com.facebook.react.uimanager.util.ReactFindViewUtil
import com.swmansion.rnscreens.Screen
import com.swmansion.rnscreens.ScreenFragmentWrapper
import com.swmansion.rnscreens.ScreenStack
import java.util.WeakHashMap

/**
 * Freezes "what is behind the Chat card" so the predictive-back hold has
 * something to reveal.
 *
 * Why a snapshot: rnscreens removes the fragment under a non-transparent top
 * screen (ScreenStack.onUpdate → transaction.remove for screens below
 * visibleBottom), so while Chat is shown ChatHome's view is detached and the
 * shrinking card would reveal only the stack host background.
 *
 * Capture: on Chat's fragment onFragmentViewCreated (inside the push commit),
 * ChatHome is still the last frame presented on screen — the new card has not
 * drawn yet and ChatHome's exit tween keeps its view attached — so a
 * PixelCopy of the window region of the ScreenStack yields ChatHome.
 *
 * Holder: the tween (rns_ios_from_right_*) is applied by FragmentManager to the
 * fragment's root view (ScreensCoordinatorLayout, from
 * ScreenStackFragment.onCreateView), which is a CHILD of the ScreenStack. So
 * the ScreenStack's own background stays still while the card's coordinator
 * slides out. We only call setBackground on it (no Fabric child mutation).
 *
 * Lifetime: installed at back start, removed when the screen below is
 * re-attached (pop committed — real ChatHome takes over during the slide),
 * when a cancel/restore finishes, when the card detaches, or onDestroy.
 * The bitmap is recycled when the Chat screen's fragment is destroyed.
 */
class BackSnapshotController(private val activity: FragmentActivity) {

  private class Entry(val stack: ScreenStack) {
    var bitmap: Bitmap? = null
    var drawable: BitmapDrawable? = null
    var installed = false
    var savedBackground: Drawable? = null
  }

  private val handler = Handler(Looper.getMainLooper())
  private val entries = WeakHashMap<Screen, Entry>()
  private val attempted = WeakHashMap<Screen, Boolean>()
  private var loggedOnce = false

  private val lifecycle =
      object : FragmentManager.FragmentLifecycleCallbacks() {
        override fun onFragmentViewCreated(
            fm: FragmentManager,
            f: Fragment,
            v: View,
            savedInstanceState: Bundle?,
        ) {
          val screen = screenOf(f) ?: return
          val stack = screen.container as? ScreenStack ?: return
          // A screen in a stack whose snapshot is installed got its view back:
          // that's the screen below being re-attached by a committed pop.
          uninstallOn(stack)
          maybeCapture(screen, stack)
        }

        override fun onFragmentDestroyed(fm: FragmentManager, f: Fragment) {
          val screen = screenOf(f) ?: return
          if (screen.container == null) dispose(screen)
        }
      }

  fun register() {
    activity.supportFragmentManager.registerFragmentLifecycleCallbacks(lifecycle, true)
  }

  fun unregister() {
    activity.supportFragmentManager.unregisterFragmentLifecycleCallbacks(lifecycle)
    for (screen in entries.keys.toList()) dispose(screen)
    attempted.clear()
  }

  /** Show the snapshot behind [card] (if one exists). Safe to call repeatedly. */
  fun install(card: View) {
    val screen = enclosingScreen(card) ?: return
    val entry = entries[screen] ?: return
    val bitmap = entry.bitmap ?: return
    if (bitmap.isRecycled || entry.installed) return
    val stack = entry.stack
    if (screen.container !== stack || !stack.isAttachedToWindow) return
    val drawable = entry.drawable ?: BitmapDrawable(activity.resources, bitmap).also { entry.drawable = it }
    entry.savedBackground = stack.background
    stack.background = drawable
    entry.installed = true
  }

  /** Remove the snapshot behind [card], restoring the stack's own background. */
  fun uninstall(card: View) {
    val screen = enclosingScreen(card) ?: return
    entries[screen]?.let { uninstallEntry(it) }
  }

  private fun uninstallOn(stack: ScreenStack) {
    for (entry in entries.values) if (entry.stack === stack) uninstallEntry(entry)
  }

  private fun uninstallEntry(entry: Entry) {
    if (!entry.installed) return
    entry.installed = false
    if (entry.stack.background === entry.drawable) entry.stack.background = entry.savedBackground
    entry.savedBackground = null
  }

  private fun maybeCapture(screen: Screen, stack: ScreenStack) {
    if (attempted.containsKey(screen)) return // pop back onto Chat: keep the original capture
    if (stack.topScreen !== screen) return
    val count = stack.screenCount
    var index = -1
    for (i in 0 until count) if (stack.getScreenAt(i) === screen) index = i
    if (index <= 0) return // first screen in stack: nothing behind it
    val below = stack.getScreenAt(index - 1)
    if (!below.isAttachedToWindow || below.width == 0) return // e.g. deep-link double push
    if (ReactFindViewUtil.findView(screen, CARD_NATIVE_ID) == null) return // only Chat cards
    attempted[screen] = true
    val entry = Entry(stack)
    entries[screen] = entry
    capture(screen, entry, Bitmap.Config.RGB_565)
  }

  private fun capture(screen: Screen, entry: Entry, config: Bitmap.Config) {
    val stack = entry.stack
    val w = stack.width
    val h = stack.height
    val window = activity.window
    if (w <= 0 || h <= 0 || window == null) {
      entries.remove(screen)
      return
    }
    val loc = IntArray(2)
    stack.getLocationInWindow(loc)
    val rect = Rect(loc[0], loc[1], loc[0] + w, loc[1] + h)
    val bitmap =
        try {
          Bitmap.createBitmap(w, h, config)
        } catch (_: Throwable) {
          entries.remove(screen)
          return
        }
    try {
      PixelCopy.request(
          window,
          rect,
          bitmap,
          { result ->
            if (result != PixelCopy.SUCCESS) {
              bitmap.recycle()
              if (config == Bitmap.Config.RGB_565 && entries[screen] === entry) {
                capture(screen, entry, Bitmap.Config.ARGB_8888)
              } else if (entries[screen] === entry) {
                entries.remove(screen)
              }
              return@request
            }
            if (entries[screen] !== entry) {
              bitmap.recycle() // disposed while copying
              return@request
            }
            entry.bitmap = bitmap
            if (!loggedOnce) {
              loggedOnce = true
              Log.i(TAG, "back snapshot captured ${w}x$h $config")
            }
          },
          handler)
    } catch (_: Throwable) {
      bitmap.recycle()
      entries.remove(screen)
    }
  }

  private fun dispose(screen: Screen) {
    attempted.remove(screen)
    val entry = entries.remove(screen) ?: return
    uninstallEntry(entry)
    entry.drawable = null
    val bitmap = entry.bitmap ?: return
    entry.bitmap = null
    // Let the RenderThread drop the last display list referencing it first.
    handler.postDelayed({ if (!bitmap.isRecycled) bitmap.recycle() }, RECYCLE_DELAY_MS)
  }

  private fun screenOf(f: Fragment): Screen? =
      try {
        (f as? ScreenFragmentWrapper)?.screen
      } catch (_: Throwable) {
        null // lateinit not yet initialised
      }

  private fun enclosingScreen(view: View): Screen? {
    var current: Any? = view
    while (current is View) {
      if (current is Screen) return current
      current = current.parent
    }
    return null
  }

  companion object {
    const val CARD_NATIVE_ID = "chat-screen-card"
    private const val TAG = "KoolaBack"
    private const val RECYCLE_DELAY_MS = 100L
  }
}
