package com.chatapp

import androidx.activity.ComponentActivity
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil

/**
 * Lets JS (e.g. the chat header "←") trigger the same Android back path as the
 * hardware/gesture back, so MainActivity's OnBackPressedCallback can play the
 * native card shrink before React Navigation pops the screen.
 *
 * Also carries two hints from JS:
 *  - setInterceptCount(n): n JS hardwareBackPress interceptors (modal, sheet,
 *    confirm dialog) are active → the next back is consumed by JS, so native
 *    must not shrink the card at all.
 *  - notifyPopping(): ChatScreen's `beforeRemove` fired → the pop is committed,
 *    native must never restore that card.
 */
class KoolaBackModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = NAME

  override fun initialize() {
    super.initialize()
    // A JS reload drops every interceptor without running its cleanup.
    KoolaBackState.interceptCount = 0
  }

  override fun invalidate() {
    KoolaBackState.interceptCount = 0
    super.invalidate()
  }

  @ReactMethod
  fun performBack() {
    UiThreadUtil.runOnUiThread {
      (currentActivity as? ComponentActivity)?.onBackPressedDispatcher?.onBackPressed()
    }
  }

  @ReactMethod
  fun setInterceptCount(count: Double) {
    KoolaBackState.interceptCount = count.toInt().coerceAtLeast(0)
  }

  @ReactMethod
  fun notifyPopping() {
    UiThreadUtil.runOnUiThread { (currentActivity as? MainActivity)?.onJsPopping() }
  }

  companion object {
    const val NAME = "KoolaBack"
  }
}

/** Process-wide hints shared between [KoolaBackModule] and [MainActivity]. */
object KoolaBackState {
  @Volatile var interceptCount: Int = 0
}
