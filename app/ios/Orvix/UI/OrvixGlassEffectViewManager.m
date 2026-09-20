#import <React/RCTViewManager.h>
#import <React/RCTConvert.h>

// Voir AppDelegate.mm : l'en-tete genere declare tout le module, y compris les
// classes qui heritent de RCTEventEmitter ou adoptent des protocoles AVKit,
// GoogleCast et WebKit. Ces frameworks doivent etre importes avant.
#import <AVKit/AVKit.h>
#import <GoogleCast/GoogleCast.h>
#import <React/RCTEventEmitter.h>
#import <WebKit/WebKit.h>

#import "Orvix-Swift.h"

#import <math.h>

@interface OrvixGlassEffectViewManager : RCTViewManager
@end

@implementation OrvixGlassEffectViewManager

RCT_EXPORT_MODULE(OrvixGlassEffectView)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (UIView *)view
{
  return [[OrvixGlassEffectView alloc] initWithFrame:CGRectZero];
}

RCT_EXPORT_VIEW_PROPERTY(interactive, BOOL)
RCT_EXPORT_VIEW_PROPERTY(prominent, BOOL)
RCT_CUSTOM_VIEW_PROPERTY(cornerRadius, NSNumber, OrvixGlassEffectView)
{
  if (json == nil || json == (id)kCFNull) {
    view.cornerRadius = nil;
    return;
  }

  NSNumber *value = [RCTConvert NSNumber:json];
  double radius = value.doubleValue;
  if (isfinite(radius) && radius >= 0.0 && radius <= 64.0) {
    view.cornerRadius = value;
  }
}

@end
