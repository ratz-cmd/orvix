package com.orvix.app

import android.app.PictureInPictureUiState
import android.content.res.Configuration
import android.os.Build
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.orvix.app.playback.PlaybackAwakeModule
import com.orvix.app.pip.AndroidPictureInPictureHost
import com.orvix.app.pip.PictureInPictureController

class MainActivity : ReactActivity() {
    internal val pictureInPictureController by lazy {
        PictureInPictureController(AndroidPictureInPictureHost(this))
    }

    override fun getMainComponentName(): String = "Orvix"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

    override fun onUserLeaveHint() {
        pictureInPictureController.onUserLeaveHint()
        super.onUserLeaveHint()
    }

    override fun onPictureInPictureRequested(): Boolean =
        pictureInPictureController.onPictureInPictureRequested()

    override fun onPictureInPictureModeChanged(active: Boolean, config: Configuration) {
        super.onPictureInPictureModeChanged(active, config)
        pictureInPictureController.onPictureInPictureModeChanged(active)
    }

    override fun onPictureInPictureUiStateChanged(pipState: PictureInPictureUiState) {
        super.onPictureInPictureUiStateChanged(pipState)
        if (Build.VERSION.SDK_INT >= 35) {
            pictureInPictureController.onPictureInPictureUiStateChanged(
                pipState.isTransitioningToPip,
            )
        }
    }

    override fun onResume() {
        super.onResume()
        pictureInPictureController.onResume(isInPictureInPictureMode)
    }

    override fun onDestroy() {
        pictureInPictureController.destroy()
        PlaybackAwakeModule.clearActivityFlag(this)
        super.onDestroy()
    }
}
