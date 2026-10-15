package com.aidoraa.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.aidoraa.app.ui.AidoraaApp

class MainActivity : ComponentActivity() {
    private val application get() = getApplication() as AidoraaApplication

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        application.platform.attach(this)
        val app = application.controller

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!app.handleBack()) {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        })

        setContent { AidoraaApp(app) }
        if (savedInstanceState == null) handleLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleLink(intent)
    }

    override fun onResume() {
        super.onResume()
        application.platform.refreshCapabilities()
        application.controller.onForeground()
    }

    override fun onDestroy() {
        application.platform.detach(this)
        super.onDestroy()
    }

    /**
     * Links the server sends back to after a Custom Tab:
     * - aidoraa://connectors/<notion|google>?result=connected|cancelled|failed
     * - aidoraa://imports?result=imported|cancelled|failed&count=N&personId=<id>&importId=<id>
     */
    private fun handleLink(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme != "aidoraa") return
        val imports = application.controller.imports
        when (uri.host) {
            "connectors" -> {
                val service = uri.pathSegments.firstOrNull()?.takeIf { it == "notion" || it == "google" } ?: return
                imports.connectorReturned(service, uri.getQueryParameter("result"))
            }
            "imports" -> imports.pickerReturned(
                result = uri.getQueryParameter("result"),
                count = uri.getQueryParameter("count")?.toIntOrNull(),
                personId = uri.getQueryParameter("personId")?.takeIf { it.isNotBlank() },
                importId = uri.getQueryParameter("importId")?.takeIf { it.isNotBlank() },
            )
        }
    }
}
