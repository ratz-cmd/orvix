package com.orvix.app

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.soloader.SoLoader
import com.orvix.app.CastPackage
import com.orvix.app.proxy.MediaProxyPackage
import com.orvix.app.playback.PlaybackAwakePackage
import com.orvix.app.pip.PictureInPicturePackage
import com.orvix.app.update.UpdatePackage

class MainApplication : Application(), ReactApplication {

    override val reactNativeHost: ReactNativeHost by lazy {
        object : DefaultReactNativeHost(this) {
            override fun getPackages(): List<ReactPackage> =
                PackageList(this).packages.apply {
                    add(DnsPackage())
                    add(UpdatePackage())
                    add(CastPackage())
                    add(MediaProxyPackage())
                    add(PlaybackAwakePackage())
                    add(PictureInPicturePackage())
                }

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = false
            override val isHermesEnabled: Boolean = true
        }
    }

    override fun onCreate() {
        super.onCreate()
        try {
            System.loadLibrary("react_featureflagsjni")
        } catch (_: Throwable) {
        }
        SoLoader.init(this, false)
    }
}
