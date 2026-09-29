package com.koabrowser.app

import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

// Browser predefinito: richiesta ruolo (Android 10+) o pagina impostazioni.
object DefaultBrowser {

    fun isDefault(c: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val rm = c.getSystemService(RoleManager::class.java) as RoleManager
                rm.isRoleAvailable(RoleManager.ROLE_BROWSER) && rm.isRoleHeld(RoleManager.ROLE_BROWSER)
            } else {
                false
            }
        } catch (e: Exception) {
            false
        }
    }

    fun request(a: Activity, done: (Boolean) -> Unit) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val rm = a.getSystemService(RoleManager::class.java) as RoleManager
                if (rm.isRoleAvailable(RoleManager.ROLE_BROWSER) && !rm.isRoleHeld(RoleManager.ROLE_BROWSER)) {
                    rm.requestRole(RoleManager.ROLE_BROWSER, a.mainExecutor, { granted ->
                        try {
                            done(granted)
                        } catch (e: Exception) {
                        }
                    })
                    return
                }
                done(rm.isRoleHeld(RoleManager.ROLE_BROWSER))
                return
            }
        } catch (e: Exception) {
        }
        try {
            a.startActivity(Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))
        } catch (e: Exception) {
        }
        done(false)
    }
}
