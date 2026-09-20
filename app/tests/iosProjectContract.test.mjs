import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const text = path => readFile(new URL(path, import.meta.url), 'utf8');
const missing = async path => {
  await assert.rejects(access(new URL(path, import.meta.url)), { code: 'ENOENT' });
};

test('iOS release metadata uses the canonical Orvix values', async () => {
  const appJson = JSON.parse(await text('../app.json'));

  assert.equal(appJson.name, 'Orvix');
  assert.equal(appJson.displayName, 'Orvix');
  // La version est celle de la release en cours : la figer ici ferait echouer
  // le contrat a chaque publication. On verifie sa forme, et le test suivant
  // verifie que le projet Xcode reste aligne dessus.
  assert.match(appJson.version, /^\d+\.\d+\.\d+$/);
  assert.match(appJson.buildNumber, /^\d+$/);
});

test('iOS project uses the canonical Orvix identity', async () => {
  const [appJson, podfile, project, scheme, info, entitlements] = await Promise.all([
    text('../app.json'),
    text('../ios/Podfile'),
    text('../ios/Orvix.xcodeproj/project.pbxproj'),
    text('../ios/Orvix.xcodeproj/xcshareddata/xcschemes/Orvix.xcscheme'),
    text('../ios/Orvix/Info.plist'),
    text('../ios/Orvix/Orvix.entitlements'),
  ]);

  assert.equal(JSON.parse(appJson).name, 'Orvix');
  assert.match(podfile, /target 'Orvix' do/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.orvix\.app;/);
  assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 15\.6;/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = "1,2";/);
  assert.match(project, /PRODUCT_NAME = Orvix;/);
  // Xcode doit suivre app.json, sinon l'IPA publiee annonce une autre version
  // que l'APK et que le manifeste de mise a jour.
  const { version, buildNumber } = JSON.parse(appJson);
  assert.match(project, new RegExp(`MARKETING_VERSION = ${version.replace(/\./g, '\\.')};`));
  assert.match(project, new RegExp(`CURRENT_PROJECT_VERSION = ${buildNumber};`));
  assert.doesNotMatch(project, /MARKETING_VERSION = (?!\d+\.\d+\.\d+;)/);
  assert.match(project, /INFOPLIST_FILE = Orvix\/Info\.plist;/);
  assert.match(project, /CODE_SIGN_ENTITLEMENTS = Orvix\/Orvix\.entitlements;/);
  assert.match(project, /SWIFT_OBJC_BRIDGING_HEADER = "?Orvix\/Orvix-Bridging-Header\.h"?;/);
  assert.match(project, /SWIFT_VERSION = 5\.0;/);
  for (const source of ['main.m', 'AppDelegate.mm', 'DnsManager.swift', 'DnsModule.m', 'DnsModuleSwift.swift']) {
    assert.match(project, new RegExp(`${source.replace('.', '\\\.')} in Sources`));
  }
  assert.match(project, /path = Orvix\/Dns;/);
  for (const resource of ['LaunchScreen.storyboard', 'PrivacyInfo.xcprivacy']) {
    assert.match(project, new RegExp(`${resource.replace('.', '\\\.')} in Resources`));
  }
  assert.match(project, /name = Orvix;/);
  assert.match(project, /productName = Orvix;/);
  assert.match(project, /name = OrvixTests;/);
  assert.match(project, /productName = OrvixTests;/);
  assert.doesNotMatch(project, /OrvixApp/);
  assert.match(scheme, /BuildableName = "Orvix\.app"/);
  assert.match(scheme, /BlueprintName = "Orvix"/);
  assert.match(scheme, /BuildableName = "OrvixTests\.xctest"/);
  assert.match(scheme, /BlueprintName = "OrvixTests"/);
  assert.match(scheme, /<TestAction\s+buildConfiguration = "Debug"/);
  assert.match(scheme, /<LaunchAction\s+buildConfiguration = "Debug"/);
  assert.match(scheme, /<ArchiveAction\s+buildConfiguration = "Release"/);
  assert.doesNotMatch(scheme, /OrvixApp/);
  assert.match(info, /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/);
  assert.match(info, /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/);
  // ATS s'applique aux requêtes natives (fetch React Native du pont GM_FETCH,
  // vérification de mise à jour), pas seulement au WebView. Les hébergeurs de
  // flux servis par le proxy Orvix n'ont aucune garantie TLS 1.2 + forward
  // secrecy : sans cette dérogation, iOS coupait ces requêtes alors qu'Android,
  // sans équivalent d'ATS, les laissait passer. La parité l'exige.
  assert.match(info, /<key>NSAllowsArbitraryLoads<\/key>\s*<true\/>/);
  assert.match(info, /<key>NSAllowsArbitraryLoadsInWebContent<\/key>\s*<true\/>/);
  assert.match(info, /<key>NSAllowsLocalNetworking<\/key>\s*<true\/>/);
  assert.match(info, /<key>NSLocalNetworkUsageDescription<\/key>\s*<string>[^<]+<\/string>/);
  assert.match(info, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>\s*<\/array>/);
  assert.match(info, /<key>UISupportedInterfaceOrientations~ipad<\/key>/);
  assert.match(entitlements, /<key>com\.apple\.developer\.networking\.networkextension<\/key>\s*<array>\s*<string>dns-settings<\/string>\s*<\/array>/);
  assert.doesNotMatch(entitlements, /com\.apple\.developer\.networking\.dns-settings/);
  assert.match(entitlements, /<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>\s*<string>applinks:orvix\.tax<\/string>\s*<\/array>/);
});

test('iOS CocoaPods integrates OrvixTests with complete inheritance', async () => {
  const podfile = await text('../ios/Podfile');

  assert.match(
    podfile,
    /target 'Orvix' do[\s\S]*?target 'OrvixTests' do\s+inherit! :complete\s+end\s+post_install do/,
  );
});

test('iOS React Native entry point, privacy manifest, and XCTest target are wired', async () => {
  const [delegate, privacy, smokeTest] = await Promise.all([
    text('../ios/Orvix/AppDelegate.mm'),
    text('../ios/Orvix/PrivacyInfo.xcprivacy'),
    text('../ios/OrvixTests/OrvixTests.swift'),
  ]);

  assert.match(delegate, /self\.moduleName = @"Orvix";/);
  assert.match(delegate, /jsBundleURLForBundleRoot:@"index"/);
  assert.match(privacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(smokeTest, /@testable import Orvix/);
  assert.match(smokeTest, /Bundle\.main\.bundleIdentifier, "com\.orvix\.app"/);
});

test('iOS media proxy policy and its XCTest suite are compiled by their targets', async () => {
  const [project, policy] = await Promise.all([
    text('../ios/Orvix.xcodeproj/project.pbxproj'),
    text('../ios/Orvix/Proxy/MediaProxyPolicy.swift'),
  ]);

  assert.match(project, /path = Orvix\/Proxy;/);
  assert.match(project, /MediaProxyPolicy\.swift in Sources/);
  assert.match(project, /MediaProxyPolicyTests\.swift in Sources/);
  assert.equal(project.match(/MediaProxyPolicy\.swift in Sources/g)?.length, 2);
  assert.equal(project.match(/MediaProxyPolicyTests\.swift in Sources/g)?.length, 2);
  assert.match(policy, /ai_socktype: SOCK_STREAM,/);
  assert.doesNotMatch(policy, /SOCK_STREAM\.rawValue/);
  assert.doesNotMatch(policy, /length != 96 \|\| bytes\[8\] == 0/);
});

// Ces deux-là ne peuvent pas être vérifiés autrement depuis un poste sans
// Xcode : le compilateur ne passera jamais ici, donc au minimum on vérifie que
// les fichiers sont bien compilés par la cible et que le nom du schéma est le
// même des trois côtés (Swift, patch WebView, script injecté). Une divergence
// de nom ne se verrait qu'à l'exécution, par un média qui ne charge pas.
test('iOS media proxy journal is compiled by the app target', async () => {
  const [project, journal] = await Promise.all([
    text('../ios/Orvix.xcodeproj/project.pbxproj'),
    text('../ios/Orvix/Proxy/MediaProxyJournal.swift'),
  ]);

  // Deux occurrences : la déclaration PBXBuildFile et l'entrée de la phase
  // Sources — même compte que pour MediaProxyPolicy.swift.
  assert.equal(project.match(/MediaProxyJournal\.swift in Sources/g)?.length, 2);
  assert.match(project, /MediaProxyJournal\.swift \*\/ = \{isa = PBXFileReference/);
  // Parité de format avec MediaProxyJournal.kt : mêmes préfixes de ligne, sans
  // quoi les journaux des deux plateformes ne se comparent plus.
  for (const prefix of ['  ~ ', '  > ', '  < ', '  corps: ', '  erreur: ']) {
    assert.ok(journal.includes(prefix), `préfixe de journal attendu : ${prefix}`);
  }
  // Le sous-système doit être l'identifiant du bundle, sinon un filtre
  // `log stream --predicate 'subsystem == "com.orvix.app"'` ne rend rien.
  assert.match(journal, /Logger\(subsystem: "com\.orvix\.app", category: "OrvixNet"\)/);
  // Découpe des lignes système, comme MAX_LOG_CHUNK côté Android.
  assert.match(journal, /maximumLogChunk = 3_000/);
});

test('the iOS media proxy journal is safe to call from concurrent media requests', async () => {
  const journal = await text('../ios/Orvix/Proxy/MediaProxyJournal.swift');

  // Deux défauts rendaient l'application inouvrable dès que la capture était
  // active, et aucun compilateur ne les voit : ce contrat les fige.
  //
  // 1. DateFormatter n'est pas sûr en concurrence. `record` est appelé depuis
  //    les tâches asynchrones de l'amont média, donc en parallèle : deux
  //    requêtes le formatant en même temps corrompaient sa mémoire interne.
  //    Sa seule utilisation doit rester entre `lock.lock()` et `lock.unlock()`.
  assert.match(journal, /private static let lock = NSLock\(\)/);
  const formatterUses = [...journal.matchAll(/timestampFormatter\.string\(/g)];
  assert.equal(formatterUses.length, 1, 'un seul point de mise en forme');
  const lockedSection = journal.slice(
    journal.lastIndexOf('lock.lock()', formatterUses[0].index),
    journal.indexOf('lock.unlock()', formatterUses[0].index),
  );
  assert.ok(
    lockedSection.includes('timestampFormatter.string('),
    'le DateFormatter doit rester sous le verrou',
  );

  // 2. Un `sync` sur une DispatchQueue bloque un fil du pool coopératif de
  //    Swift Concurrency. Quelques segments HLS en parallèle suffisaient à
  //    l'assécher : l'app se figeait et le watchdog la tuait.
  assert.doesNotMatch(journal, /DispatchQueue\(/);
  assert.doesNotMatch(journal, /\bqueue\.sync\b/);

  // La capture peut être coupée pendant la mise en forme : sans relecture sous
  // le verrou, une entrée en vol ressuscite un tampon déjà vidé.
  assert.match(journal, /lock\.lock\(\)\s*\n[\s\S]{0,400}?guard enabledStorage else \{/);
});

test('the network journal toggle never survives a restart', async () => {
  const service = await text('../src/services/networkJournal.ts');

  // Une capture retenue en mémoire morte relançait le même plantage à chaque
  // démarrage : l'app devenait inouvrable et seule une réinstallation en
  // sortait. Un réglage de débogage ne doit jamais pouvoir condamner l'app —
  // et l'écran de réglages promet déjà que le journal disparaît à la fermeture.
  assert.doesNotMatch(service, /AsyncStorage/);
  assert.doesNotMatch(service, /STORAGE_KEY/);
  assert.match(service, /let enabled = false;/);
  // La bascule ne doit jamais rejeter jusqu'à l'interface.
  assert.match(
    service,
    /export async function setNetworkJournalEnabled[\s\S]*?try \{[\s\S]*?setJournalEnabled\?\.\(value\);[\s\S]*?\} catch \{/,
  );
});

test('iOS custom media scheme is compiled, registered, and named identically everywhere', async () => {
  const [project, handler, webviewPatch, runtime, browser] = await Promise.all([
    text('../ios/Orvix.xcodeproj/project.pbxproj'),
    text('../ios/Orvix/Proxy/MediaProxySchemeHandler.swift'),
    text('../patches/react-native-webview+13.16.1.patch'),
    text('../src/injection/bridge-runtime.ts'),
    text('../src/components/WebViewBrowser.tsx'),
  ]);

  assert.equal(
    project.match(/MediaProxySchemeHandler\.swift in Sources/g)?.length,
    2,
  );
  // Le fichier est compilé dans l'app, mais la classe est instanciée depuis les
  // Pods par NSClassFromString : le nom exposé à l'Objective-C fait le lien.
  assert.match(handler, /@objc\(OrvixMediaSchemeHandler\)/);
  assert.match(handler, /WKURLSchemeHandler/);
  assert.match(webviewPatch, /NSClassFromString\(@"OrvixMediaSchemeHandler"\)/);
  assert.match(webviewPatch, /setURLSchemeHandler:handler forURLScheme:@"orvix-media"/);
  assert.match(handler, /static let scheme = "orvix-media"/);
  assert.match(runtime, /__ORVIX_MEDIA_PROXY_SCHEME__/);
  assert.match(browser, /mediaProxyScheme: Platform\.OS === 'ios' \? 'orvix-media' : null/);
});

test('iOS HLS playlist rewriter and its XCTest suite are compiled by their targets', async () => {
  const [project, rewriter, tests] = await Promise.all([
    text('../ios/Orvix.xcodeproj/project.pbxproj'),
    text('../ios/Orvix/Proxy/HLSPlaylistRewriter.swift'),
    text('../ios/OrvixTests/HLSPlaylistRewriterTests.swift'),
  ]);

  assert.match(project, /HLSPlaylistRewriter\.swift in Sources/);
  assert.match(project, /HLSPlaylistRewriterTests\.swift in Sources/);
  assert.equal(project.match(/HLSPlaylistRewriter\.swift in Sources/g)?.length, 2);
  assert.equal(project.match(/HLSPlaylistRewriterTests\.swift in Sources/g)?.length, 2);
  assert.match(rewriter, /enum HLSPlaylistRewriter/);
  assert.match(rewriter, /convertSubRipToWebVTT/);
  assert.match(rewriter, /text\/vtt; charset=utf-8/);
  assert.match(rewriter, /isSafeRelativeLocalReference/);
  assert.match(rewriter, /allowedAttributeDirectives/);
  assert.match(rewriter, /invalidLocalizedURL/);
  assert.match(tests, /@testable import Orvix/);
  assert.match(tests, /testDoesNotRewriteURITextInsideQuotedValuesOrNonURIAttributes/);
});

test('iOS authenticated media proxy session store and its XCTest suite are compiled by their targets', async () => {
  const [project, models, store, tests] = await Promise.all([
    text('../ios/Orvix.xcodeproj/project.pbxproj'),
    text('../ios/Orvix/Proxy/MediaProxyModels.swift'),
    text('../ios/Orvix/Proxy/MediaProxySessionStore.swift'),
    text('../ios/OrvixTests/MediaProxySessionStoreTests.swift'),
  ]);

  for (const source of ['MediaProxyModels.swift', 'MediaProxySessionStore.swift', 'MediaProxySessionStoreTests.swift']) {
    assert.match(project, new RegExp(`${source.replace('.', '\\.')} in Sources`));
    assert.equal(project.match(new RegExp(`${source.replace('.', '\\.')} in Sources`, 'g'))?.length, 2);
  }
  assert.match(models, /struct MediaProxyTarget: Equatable, Sendable/);
  assert.match(models, /struct MediaProxyResource: Equatable, Sendable/);
  assert.match(models, /enum MediaProxyResolution: Equatable, Sendable/);
  assert.match(models, /struct MediaProxySessionRotation: Equatable, Sendable/);
  assert.match(models, /struct MediaProxySessionStoreDiagnostics: Equatable, Sendable/);
  assert.match(models, /struct MediaProxyLeasedResource: Sendable/);
  assert.match(models, /enum MediaProxyLeasedResolution: Sendable/);
  assert.match(models, /struct MediaProxySessionStoreConfiguration: Equatable, Sendable/);
  assert.match(store, /actor MediaProxySessionStore/);
  assert.match(store, /SecRandomCopyBytes/);
  assert.match(store, /func rotate\(sessionID: String\)/);
  assert.match(store, /func resolveLoopbackRequest\(/);
  assert.match(store, /final class MediaProxyAccessLease/);
  assert.match(store, /final class MediaProxySessionAccessState/);
  assert.match(store, /func withValidAccess/);
  assert.match(store, /absoluteDeadline/);
  assert.match(store, /idleDeadline/);
  assert.match(store, /refreshIdleDeadlineLocked/);
  assert.match(store, /func resolveLoopbackRequestWithLease\(/);
  assert.match(store, /let resourceID = try generateUniqueIdentifier\(\)\r?\n    if let evictedResourceID/);
  assert.match(store, /let resourceID = try generateUniqueIdentifier\(additionalReserved: \[sessionID\]\)[\s\S]*if let evictedSessionID/);
  assert.match(store, /accessBarrier\.revoke\(\)/);
  assert.match(store, /normalizedDuration/);
  assert.match(store, /\.isFinite/);
  assert.match(store, /resourceIDsByTarget/);
  assert.match(store, /identifierTombstones/);
  assert.match(store, /canonicalLoopbackAuthority/);
  assert.doesNotMatch(store, /issuedSessionIDs|issuedResourceIDs/);
  assert.match(tests, /testCastURLParserAcceptsOnlyExactAuthenticatedLoopbackPaths/);
  assert.match(tests, /testRotationAtomicallyRedirectsOldCredentialsDuringBoundedGrace/);
  assert.match(tests, /testSlidingPlaylistChurnKeepsRootAndRecentWindowWithinBounds/);
  assert.match(tests, /testOnlyAuthenticatedLiveTokensResolveAndAbsoluteExpiryIsIndependentFromIdle/);
  assert.match(tests, /testRotationSynchronouslyRevokesRootAndSegmentLeases/);
  assert.match(tests, /testInvalidationWaitsForActiveEmissionThenRejectsEveryLaterSection/);
  assert.match(tests, /testSuccessiveRotationsRetargetRootAndSegmentDirectlyToTerminalSuccessor/);
  assert.match(tests, /testNonFiniteDurationsUseFiniteDefaultsForBothInitializers/);
  assert.match(tests, /testLeaseEnforcesIdleAndAbsoluteDeadlinesWithoutActorPurge/);
  assert.match(tests, /testCapacityCollisionFailureLeavesSessionTransitionsTombstonesAndLeaseUnchanged/);
  assert.match(tests, /testSessionCapacityCollisionFailureLeavesExistingSessionAndLeaseUnchanged/);
});

test('iOS loopback media proxy transport and server are securely wired', async () => {
  const [project, upstream, parser, server, parserTests, integrationTests] = await Promise.all([
    text('../ios/Orvix.xcodeproj/project.pbxproj'),
    text('../ios/Orvix/Proxy/MediaProxyUpstream.swift'),
    text('../ios/Orvix/Proxy/MediaProxyHTTPParser.swift'),
    text('../ios/Orvix/Proxy/MediaProxyServer.swift'),
    text('../ios/OrvixTests/MediaProxyHTTPParserTests.swift'),
    text('../ios/OrvixTests/MediaProxyIntegrationTests.swift'),
  ]);

  for (const source of [
    'MediaProxyUpstream.swift',
    'MediaProxyHTTPParser.swift',
    'MediaProxyServer.swift',
    'MediaProxyHTTPParserTests.swift',
    'MediaProxyIntegrationTests.swift',
  ]) {
    assert.match(project, new RegExp(`${source.replace('.', '\\.')} in Sources`));
    assert.equal(project.match(new RegExp(`${source.replace('.', '\\.')} in Sources`, 'g'))?.length, 2);
  }

  assert.match(parser, /maximumRequestBytes\s*=\s*64 \* 1_024/);
  assert.match(parser, /maximumRequestLineBytes\s*=\s*8 \* 1_024/);
  assert.match(parser, /method == "GET" \|\| method == "HEAD"/);
  assert.match(parser, /duplicateRange/);
  assert.match(parser, /absoluteFormForbidden/);
  assert.match(parser, /malformedPercentEscape/);
  assert.match(parserTests, /testParserAcceptsBoundedGetAndRange/);
  assert.match(parserTests, /testParserRejectsPostAndOversizedHeaders/);
  assert.match(parserTests, /testParserRejectsBodiesAbsoluteFormMalformedEscapesAndDuplicateRange/);
  assert.match(parserTests, /testParserRejectsObsFoldAndHeaderInjection/);

  assert.match(upstream, /final class MediaProxyPinnedHTTPTransport/);
  assert.match(upstream, /NWConnection\(/);
  assert.match(upstream, /sec_protocol_options_set_tls_server_name/);
  assert.match(upstream, /validatePublicHTTPSURL/);
  assert.match(upstream, /maximumRedirects\s*=\s*5/);
  assert.match(upstream, /completionHandler\(nil\)/);
  assert.match(upstream, /MediaProxyURLSessionTestingTransport/);
  assert.match(upstream, /pinnedAddresses/);
  assert.match(upstream, /maximumInformationalResponses/);
  assert.match(upstream, /MediaProxyHTTPResponseHeadDecoder/);
  assert.match(upstream, /MediaProxyChunkedBodyDecoder/);
  assert.match(upstream, /validateEndOfStream/);
  assert.doesNotMatch(upstream, /allowsAnyHTTPSCertificate|serverTrust.*useCredential/);

  assert.match(server, /requiredLocalEndpoint\s*=\s*\.hostPort\(/);
  assert.match(server, /NWEndpoint\.Host\("127\.0\.0\.1"\)/);
  assert.match(server, /NWListener\(using: parameters, on: \.any\)/);
  assert.match(server, /resolveLoopbackRequestWithLease/);
  assert.doesNotMatch(server, /resolveLoopbackRequest\(/);
  assert.match(server, /lease\.withValidAccess/);
  assert.match(server, /lease\.release\(\)/);
  assert.match(server, /307 Temporary Redirect/);
  assert.match(server, /HLSPlaylistRewriter\.convertSubRipToWebVTT/);
  assert.match(server, /text\/vtt; charset=utf-8/);
  assert.match(server, /\.contentProcessed/);
  assert.match(server, /body\.cancel\(\)/);
  assert.match(server, /listenerGeneration/);
  assert.match(server, /listenerStartTimeout/);
  assert.match(server, /sendTimeout/);
  assert.match(server, /requestDeadline/);
  assert.match(server, /upstreamResponse\.statusCode == 200[\s\S]*Self\.isHLS/);
  assert.doesNotMatch(server, /0\.0\.0\.0|localhost/);

  for (const coverage of [
    'testRedirectsAreRevalidatedAndPinnedAtEveryHop',
    'testRejectsPrivateRebindingAnswerBeforeTransportStarts',
    'testServerRewritesFinalURLPlaylistConvertsSRTAndPreservesRange206',
    'testHeadPreservesHeadersWithoutSendingABody',
    'testStreamingUsesBackpressureAndDisconnectCancelsUpstream',
    'testExpiredOrRevokedLeaseStopsStreaming',
    'testRotationReturnsStrictLocal307AndRetargetsAThroughC',
    'testLocalizedCrossHostHLSResourcesInheritProviderHeadersWithoutSensitiveHeaders',
    'testPartialHLS206StreamsRawAndPreservesRangeHeaders',
    'testPinnedResponseDecoderConsumesInformationalResponsesAndRejectsAmbiguousBodylessFraming',
    'testChunkedDecoderRequiresCompleteTrailersAndBoundsExtensions',
    'testPinnedTransportTriesValidatedAddressesSequentially',
    'testPinnedTransportFailsAfterAllValidatedAddressesFail',
    'testListenerCloseInvalidatesPendingGenerationAndConcurrentOpenSharesLiveListener',
    'testLoopbackClientCapIsExactAndEarlyFailureReleasesSlot',
    'testRequestDeadlineIsAbsoluteAndBlockedSendTimesOut',
    'testControlledSendCompletionEnforcesBackpressure',
    'testHeadErrorsHaveNoBodyAndEncodedSubRipIsRejected',
  ]) {
    assert.match(integrationTests, new RegExp(coverage));
  }
});

test('the app icon catalog is compiled into the Orvix bundle', async () => {
  const project = await text('../ios/Orvix.xcodeproj/project.pbxproj');
  const catalog = JSON.parse(
    await text('../ios/Orvix/Images.xcassets/AppIcon.appiconset/Contents.json'),
  );

  // Les fichiers d'icones ne suffisent pas : sans reference, appartenance au
  // groupe, phase Resources et nom de catalogue, l'IPA sort sans icone.
  assert.match(
    project,
    /isa = PBXFileReference; lastKnownFileType = folder\.assetcatalog;[^\n]*path = Orvix\/Images\.xcassets;/,
  );
  assert.match(project, /Images\.xcassets in Resources \*\/ = \{isa = PBXBuildFile;/);
  assert.match(project, /Images\.xcassets in Resources \*\/,/);
  assert.equal(
    project.match(/ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/g)?.length,
    2,
    'les configurations Debug et Release doivent toutes deux nommer AppIcon',
  );

  // L'icone du store est obligatoire, et une entree sans fichier fait echouer
  // la compilation du catalogue.
  assert.ok(
    catalog.images.some(image => image.size === '1024x1024' && image.filename),
    'le catalogue doit fournir l icone 1024x1024',
  );
  await Promise.all(
    catalog.images.map(image => text(
      `../ios/Orvix/Images.xcassets/AppIcon.appiconset/${image.filename}`,
    )),
  );
});

test('legacy OrvixApp Xcode artifacts are absent', async () => {
  await Promise.all([
    missing('../ios/OrvixApp.xcodeproj'),
    missing('../ios/OrvixApp.xcworkspace'),
    missing('../ios/OrvixAppTests'),
  ]);
});

test('every framework the generated Swift header names is imported before it', async () => {
  // `Orvix-Swift.h` declare tout le module @objc d'un coup, et Swift n'y
  // forward-declare que ses propres types : un protocole venant d'un framework
  // tiers y apparait nu. Sans son import prealable, la compilation casse sur
  // « cannot find protocol declaration », loin du fichier Swift fautif — c'est
  // ce qui est arrive quand OrvixMediaSchemeHandler a adopte WKURLSchemeHandler
  // sans que WebKit soit importe.
  const importers = [
    '../ios/Orvix/AppDelegate.mm',
    '../ios/Orvix/UI/OrvixBrowserChromeViewManager.m',
    '../ios/Orvix/UI/OrvixGlassEffectViewManager.m',
  ];
  const required = [
    '<AVKit/AVKit.h>',
    '<GoogleCast/GoogleCast.h>',
    '<React/RCTEventEmitter.h>',
    '<WebKit/WebKit.h>',
  ];

  for (const path of importers) {
    const source = await text(path);
    const generated = source.indexOf('#import "Orvix-Swift.h"');
    assert.notEqual(generated, -1, `${path} doit importer l'en-tete genere`);
    for (const framework of required) {
      const at = source.indexOf(`#import ${framework}`);
      assert.notEqual(at, -1, `${path} doit importer ${framework}`);
      assert.ok(at < generated, `${path} : ${framework} doit preceder Orvix-Swift.h`);
    }
  }
});

test('the Swift sources adopting third-party protocols stay covered by that list', async () => {
  // Si une classe @objc adopte un protocole d'un framework absent de la liste
  // ci-dessus, le test precedent passe alors que la compilation casse.
  const handler = await text('../ios/Orvix/Proxy/MediaProxySchemeHandler.swift');
  assert.match(handler, /@objc\(OrvixMediaSchemeHandler\)/);
  assert.match(handler, /WKURLSchemeHandler/);
  assert.match(handler, /^import WebKit$/m);
});
