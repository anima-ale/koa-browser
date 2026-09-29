# KOA Browser Mobile: tieni WebView, download e vault fuori dall'offuscamento.
-keep class android.webkit.** { *; }
-keep class com.koabrowser.app.** { *; }
# Tink (via security-crypto): annotazioni solo compile-time, mai a runtime.
-dontwarn com.google.errorprone.annotations.**
-dontwarn javax.annotation.**
-dontwarn javax.annotation.concurrent.**
