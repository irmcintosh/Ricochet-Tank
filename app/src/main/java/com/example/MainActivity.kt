package com.example

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.util.Locale
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      window.attributes = window.attributes.apply {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }
    hideSystemBars()
    setContent {
      MyApplicationTheme(darkTheme = true, dynamicColor = false) {
        RicochetTanksScreen()
      }
    }
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  private fun hideSystemBars() {
    WindowCompat.getInsetsController(window, window.decorView).apply {
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      hide(WindowInsetsCompat.Type.systemBars())
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun RicochetTanksScreen() {
  var webViewGeneration by remember { mutableIntStateOf(0) }

  Box(
    modifier =
      Modifier.fillMaxSize()
        .background(ComposeColor(0xFF121619))
  ) {
    key(webViewGeneration) {
      RicochetTanksWebView(
        onRendererCrash = { webViewGeneration++ }
      )
    }
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun RicochetTanksWebView(onRendererCrash: () -> Unit) {
  val context = LocalContext.current
  val lifecycleOwner = LocalLifecycleOwner.current
  val gameDescription = stringResource(id = R.string.game_webview_description)

  val voiceController = remember { TacticalVoiceController(context.applicationContext) }

  val webView = remember {
    WebView(context).apply {
      layoutParams =
        ViewGroup.LayoutParams(
          ViewGroup.LayoutParams.MATCH_PARENT,
          ViewGroup.LayoutParams.MATCH_PARENT,
        )
      setBackgroundColor(Color.parseColor("#121619"))
      isFocusable = true
      isFocusableInTouchMode = true

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
      }

      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        mediaPlaybackRequiresUserGesture = false
        useWideViewPort = true
        loadWithOverviewMode = true
        setSupportZoom(false)
        builtInZoomControls = false
        displayZoomControls = false
        cacheMode = WebSettings.LOAD_NO_CACHE
      }

      addJavascriptInterface(voiceController, "RicochetVoice")

      webViewClient =
        object : WebViewClient() {
          override fun onRenderProcessGone(
            view: WebView?,
            detail: RenderProcessGoneDetail?,
          ): Boolean {
            val crashed =
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                detail?.didCrash() == true
              } else {
                true
              }
            Log.e("RicochetTanks", "WebView renderer gone (didCrash=$crashed); recovering WebView.")
            (view?.parent as? ViewGroup)?.removeView(view)
            view?.destroy()
            onRendererCrash()
            return true
          }
        }
      webChromeClient = WebChromeClient()
      loadUrl("file:///android_asset/index.html")
    }
  }

  DisposableEffect(lifecycleOwner, webView) {
    val observer = LifecycleEventObserver { _, event ->
      when (event) {
        Lifecycle.Event.ON_RESUME -> {
          webView.onResume()
          webView.resumeTimers()
        }
        Lifecycle.Event.ON_PAUSE -> {
          voiceController.stop()
          webView.onPause()
          webView.pauseTimers()
        }
        else -> Unit
      }
    }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose {
      lifecycleOwner.lifecycle.removeObserver(observer)
      voiceController.shutdown()
      (webView.parent as? ViewGroup)?.removeView(webView)
      webView.stopLoading()
      webView.destroy()
    }
  }

  AndroidView(
    factory = { webView },
    update = { view ->
      if (!view.hasFocus()) {
        view.requestFocus()
      }
    },
    modifier =
      Modifier.fillMaxSize()
        .testTag("ricochet_tanks_webview")
        .semantics { contentDescription = gameDescription },
  )
}

private class TacticalVoiceController(context: android.content.Context) {
  @Volatile
  private var ready = false

  private var tts: TextToSpeech? = null

  init {
    try {
      tts = TextToSpeech(context) { status ->
        if (status == TextToSpeech.SUCCESS) {
          val engine = tts ?: return@TextToSpeech
          val langRes = engine.setLanguage(Locale.US)
          if (langRes != TextToSpeech.LANG_MISSING_DATA && langRes != TextToSpeech.LANG_NOT_SUPPORTED) {
            engine.setPitch(0.84f)
            engine.setSpeechRate(1.06f)
            ready = true
          } else {
            ready = engine.setLanguage(Locale.getDefault()) >= TextToSpeech.LANG_AVAILABLE
          }
        }
      }
    } catch (t: Throwable) {
      Log.w("RicochetTanks", "TTS init unavailable: ${t.message}")
      ready = false
    }
  }

  @JavascriptInterface
  fun speak(phrase: String?) {
    if (!ready || phrase.isNullOrBlank()) return
    val cleaned = phrase.trim().take(120)
    try {
      val params = Bundle().apply {
        putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 0.45f)
      }
      tts?.speak(cleaned, TextToSpeech.QUEUE_FLUSH, params, "tac_${System.nanoTime()}")
    } catch (_: Throwable) {
    }
  }

  @JavascriptInterface
  fun stop() {
    try {
      tts?.stop()
    } catch (_: Throwable) {
    }
  }

  fun shutdown() {
    ready = false
    try {
      tts?.stop()
      tts?.shutdown()
    } catch (_: Throwable) {
    } finally {
      tts = null
    }
  }
}
