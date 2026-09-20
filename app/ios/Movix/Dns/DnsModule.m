#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(DnsModule, NSObject)

RCT_EXTERN_METHOD(enable:(NSString *)primaryDns
                  secondaryDns:(NSString *)secondaryDns
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(disable:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isEnabled:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
