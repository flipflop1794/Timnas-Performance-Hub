import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import vm from "node:vm";
import {
  attachLocalScreenDetection,
  calculateLocalTeamfightParticipation,
  buildLocalDamageFieldRectangles,
  buildLocalGoldFieldRectangles,
  classifyLocalMvpBadgeTone,
  classifyLocalResultScreenHeader,
  classifyLocalResultScreenLabel,
  classifyLocalScoreboardGeometry,
  findLocalScanAnomalies,
  formatLocalDurationEntry,
  normalizeScannerHeroKey,
  parseLocalOcrDuration,
  parseLocalOcrInteger,
  parseLocalOcrIntegerSequence,
  parseLocalOcrRating,
  resolveLocalBadgeVisualCandidate,
  resolveLocalBatchGameAssignments,
  resolveLocalMatchOutcome,
  resolveLocalMvpCandidate,
  resolveLocalResultScreenKinds,
  scaleLocalOcrReviewScore,
  selectLocalOcrDurationCandidate,
  selectLocalOcrDamageCandidate,
  selectLocalOcrGoldCandidate,
  selectLocalOcrIntegerCandidate,
  selectLocalOcrRatingCandidate,
  selectLocalOcrSequenceCandidate,
  selectLocalTeamKillCandidate,
  solveHeroAssignment,
  validateLocalScannerDraft,
} from "../src/lib/localResultScanner.js";

assert.equal(normalizeScannerHeroKey("Luo Yi"), "luoyi");
assert.equal(normalizeScannerHeroKey("X.Borg"), "xborg");

assert.equal(parseLocalOcrInteger("15,023"), 15023);
assert.equal(parseLocalOcrInteger("10.1K"), 10100);
assert.equal(parseLocalOcrInteger("O8"), 8);
assert.equal(parseLocalOcrInteger("ZB"), 28, "Common OCR letter shapes must remain usable as team-score digits");
assert.equal(parseLocalOcrInteger("not read"), null);
assert.equal(scaleLocalOcrReviewScore(54), 92, "The review display must scale a 54 score by 1.7");
assert.equal(scaleLocalOcrReviewScore(60), 98, "Adjusted scores must stay below the trusted gate");
assert.equal(scaleLocalOcrReviewScore(95), 98, "Scaling must not silently make uncertain OCR trusted");
assert.equal(scaleLocalOcrReviewScore(99), 99, "Already trusted OCR keeps its original score");
assert.equal(scaleLocalOcrReviewScore(0), 0, "Missing OCR evidence must remain missing");
assert.deepEqual(parseLocalOcrIntegerSequence("03 1 13 9562"), [3, 1, 13, 9562]);
assert.deepEqual(parseLocalOcrIntegerSequence("66059 3199 211596"), [66059, 3199, 211596]);
assert.equal(parseLocalOcrDuration("Duration 21:12"), "21:12");
assert.equal(parseLocalOcrDuration("7.05"), "07:05");
assert.equal(parseLocalOcrDuration("2229"), "22:29");
assert.equal(parseLocalOcrDuration("21:88"), "");
assert.equal(formatLocalDurationEntry("2229"), "22:29");
assert.equal(formatLocalDurationEntry("22:29"), "22:29");
assert.equal(formatLocalDurationEntry("18"), "18");
assert.equal(formatLocalDurationEntry("1865"), "18:65", "Invalid seconds must remain visible for review");
assert.equal(parseLocalOcrDuration(formatLocalDurationEntry("1865")), "");
assert.equal(parseLocalOcrRating("7.8"), 7.8);
assert.equal(parseLocalOcrRating("IR 78"), 7.8);
assert.equal(parseLocalOcrRating("107"), 10.7);
assert.equal(parseLocalOcrRating("G.8"), 6.8, "A grade six misread as G must be recovered");
assert.equal(parseLocalOcrRating("B.Z"), 8.2, "Common grade glyph substitutions must be recovered");
assert.equal(parseLocalOcrRating("1"), null);
assert.equal(parseLocalOcrRating("17"), null, "An ambiguous dropped decimal must be reviewed instead of becoming a false 1.7");
assert.equal(parseLocalOcrRating("0.6"), null, "An impossible OCR 0.x grade must trigger review so a real 6.x can be retried");
assert.equal(parseLocalOcrRating("2.9"), null);
assert.equal(parseLocalOcrRating("3.0"), 3);
assert.equal(parseLocalOcrRating("10700"), null);
assert.equal(classifyLocalScoreboardGeometry(1920 / 1080), "standard");
assert.equal(classifyLocalScoreboardGeometry(2048 / 1024), "wide");
assert.equal(classifyLocalScoreboardGeometry(1640 / 720), "ultraWide");
const consensusRating = selectLocalOcrRatingCandidate([
  { text: "66", confidence: 0, mode: "light-120" },
  { text: "66", confidence: 0, mode: "light-135" },
]);
assert.equal(consensusRating.value, 6.6, "Two matching grade passes must preserve a readable IR even at low Tesseract confidence");
assert.equal(consensusRating.disagreement, false);
assert.ok(consensusRating.confidence >= 90, "Two calibrated IR passes that agree must meet the target confidence");
assert.equal(consensusRating.confidence, 95, "Two agreeing low-confidence passes must remain below the 99% trusted gate");
const trustedRating = selectLocalOcrRatingCandidate([
  { text: "6.6", confidence: 92, mode: "light-120" },
  { text: "66", confidence: 91, mode: "light-135" },
  { text: "6.6", confidence: 93, mode: "light-150" },
]);
assert.equal(trustedRating.confidence, 99, "Three agreeing IR passes must reach the trusted-confidence gate");
const trustedInteger = selectLocalOcrIntegerCandidate([
  { text: "15023", confidence: 96, mode: "binary" },
  { text: "15,023", confidence: 94, mode: "raw" },
  { text: "15023", confidence: 92, mode: "light-140" },
], "damage");
assert.equal(trustedInteger.value, 15023);
assert.equal(trustedInteger.confidence, 99, "Three agreeing integer passes must reach the trusted-confidence gate");
assert.ok(selectLocalOcrIntegerCandidate([
  { text: "15023", confidence: 96, mode: "binary" },
  { text: "15024", confidence: 97, mode: "raw" },
  { text: "15023", confidence: 94, mode: "light-140" },
], "damage").confidence < 99, "Any plausible disagreement must stay below the trusted-confidence gate");
const leftDamageRectangles = buildLocalDamageFieldRectangles("left", "damage", 0.543);
const leftDamageTakenRectangles = buildLocalDamageFieldRectangles("left", "damageTaken", 0.543);
assert.equal(leftDamageRectangles.length, 5, "Hero Damage OCR must inspect the tight crop");
assert.equal(leftDamageTakenRectangles.length, 5, "Damage Taken OCR must inspect the tight crop");
const leftDamageSafe = leftDamageRectangles.find(({ geometry }) => geometry === "safe-wide").rectangle;
const leftDamageTakenSafe = leftDamageTakenRectangles.find(({ geometry }) => geometry === "safe-wide").rectangle;
assert.ok(leftDamageSafe.width > 0.064, "The safe Damage crop must be wider than the precise crop");
assert.ok(leftDamageTakenSafe.width > 0.064, "The safe Damage Taken crop must be wider than the precise crop");
assert.ok(
  leftDamageSafe.x + leftDamageSafe.width < leftDamageTakenSafe.x,
  "Wider Damage crops must stop before the adjacent statistic columns",
);
const rectangleContainsX = (rectangle, x) => rectangle.x <= x && rectangle.x + rectangle.width >= x;
assert.equal(rectangleContainsX(leftDamageSafe, 0.213), true, "Safe Damage crop must cover the older left-side alignment");
assert.equal(rectangleContainsX(leftDamageTakenSafe, 0.367), true, "Safe Damage Taken crop must cover the older left-side alignment");
const rightDamageRectangles = buildLocalDamageFieldRectangles("right", "damage", 0.543);
const rightDamageTakenRectangles = buildLocalDamageFieldRectangles("right", "damageTaken", 0.543);
assert.equal(rectangleContainsX(rightDamageRectangles.find(({ geometry }) => geometry === "safe-wide").rectangle, 0.516), true, "Safe Damage crop must cover the older right-side alignment");
assert.equal(rectangleContainsX(rightDamageTakenRectangles.find(({ geometry }) => geometry === "safe-wide").rectangle, 0.669), true, "Safe Damage Taken crop must cover the older right-side alignment");
const rightDamageLower = rightDamageRectangles.find(({ geometry }) => geometry === "wide-lower").rectangle;
assert.ok(rightDamageLower.y <= 0.543 + 0.018, "Lower geometry must reach the older vertical Damage alignment");
assert.ok(rightDamageLower.y + rightDamageLower.height >= 0.543 + 0.018, "Lower geometry must fully include the older vertical Damage alignment");
assert.ok(leftDamageSafe.x + leftDamageSafe.width > 0.245, "Safe Damage crop must retain trailing digits without reaching the middle statistic");
const damageTakenTight = leftDamageTakenRectangles.find(({ geometry }) => geometry === "tight").rectangle;
assert.ok(rectangleContainsX(damageTakenTight, 0.334) && rectangleContainsX(damageTakenTight, 0.375), "Tight crop must contain the full 57076 sample without surrounding bar graphics");
const yveDamageTakenTight = buildLocalDamageFieldRectangles("left", "damageTaken", 0.414).find(({ geometry }) => geometry === "tight");
assert.equal(yveDamageTakenTight.threshold, 105);
assert.ok(yveDamageTakenTight.rectangle.y + yveDamageTakenTight.rectangle.height < 0.427, "Yve's tight crop must stop before the graph bar that changes 5 into 2");
assert.equal(selectLocalOcrDamageCandidate([
  { text: "24415", confidence: 60, mode: "safe-wide raw", geometry: "safe-wide" },
  { text: "24415", confidence: 54, mode: "precise binary", geometry: "precise" },
  { text: "54415", confidence: 96, mode: "tight light-105", geometry: "tight" },
  { text: "54415", confidence: 96, mode: "tight raw", geometry: "tight" },
], "damageTaken").value, 54415, "A clear tight-crop 54415 must beat weaker 24415 readings");
const kimmyDamageTight = buildLocalDamageFieldRectangles("left", "damage", 0.801).find(({ geometry }) => geometry === "tight").rectangle;
assert.ok(rectangleContainsX(kimmyDamageTight, 0.176) && rectangleContainsX(kimmyDamageTight, 0.216), "Kimmy's 66860 Hero Damage must fit the tighter bottom-row crop");
assert.ok(kimmyDamageTight.y < 0.79 && kimmyDamageTight.y + kimmyDamageTight.height > 0.8);
assert.equal(selectLocalOcrDamageCandidate([
  { text: "", confidence: 0, mode: "precise binary", geometry: "precise" },
  { text: "", confidence: 0, mode: "safe-wide raw", geometry: "safe-wide" },
  { text: "66860", confidence: 96, mode: "tight light-105", geometry: "tight" },
], "damage").value, 66860, "Focused re-scan must retain a valid Kimmy reading even when the older crops are blank");
const recoveredCompleteDamage = selectLocalOcrDamageCandidate([
  { text: "923", confidence: 96, mode: "row binary", geometry: "row-sequence" },
  { text: "923", confidence: 94, mode: "row raw", geometry: "row-sequence" },
  { text: "923", confidence: 95, mode: "precise binary", geometry: "precise" },
  { text: "10923", confidence: 91, mode: "wide binary", geometry: "safe-wide" },
  { text: "10923", confidence: 90, mode: "upper light", geometry: "wide-upper" },
], "damage");
assert.equal(recoveredCompleteDamage.value, 10923, "Cross-geometry Damage OCR must prefer a supported complete value over a clipped leading-digit majority");
assert.ok(recoveredCompleteDamage.confidence < 99, "A recovered value with remaining disagreement must still require review");
for (const [complete, clipped] of [[151416, 15141], [127555, 12755], [182559, 18255]]) {
  const recoveredTrailingDigit = selectLocalOcrDamageCandidate([
    { text: String(clipped), confidence: 97, mode: "row binary", geometry: "row-sequence" },
    { text: String(clipped), confidence: 96, mode: "precise binary", geometry: "precise" },
    { text: String(clipped), confidence: 95, mode: "precise light", geometry: "precise" },
    { text: String(complete), confidence: 91, mode: "safe binary", geometry: "safe-wide" },
    { text: String(complete), confidence: 90, mode: "lower light", geometry: "wide-lower" },
  ], "damageTaken");
  assert.equal(recoveredTrailingDigit.value, complete, `Damage OCR must recover trailing digit in ${complete}`);
  assert.ok(recoveredTrailingDigit.confidence < 99, "Recovered trailing digits with conflicting crops must remain highlighted for review");
}
const trustedDamage = selectLocalOcrDamageCandidate([
  { text: "10923", confidence: 93, mode: "wide binary", geometry: "safe-wide" },
  { text: "10,923", confidence: 92, mode: "wide light", geometry: "safe-wide" },
  { text: "10923", confidence: 94, mode: "precise binary", geometry: "precise" },
], "damage");
assert.equal(trustedDamage.confidence, 99, "Damage confidence may reach 99 only after consensus spans multiple crop geometries");
const correctedFirstDigit = selectLocalOcrDamageCandidate([
  { text: "27076", confidence: 40, mode: "precise binary", geometry: "precise" },
  { text: "27076", confidence: 65, mode: "safe-wide raw", geometry: "safe-wide" },
  { text: "57076", confidence: 94, mode: "tight light-105", geometry: "tight" },
  { text: "57076", confidence: 81, mode: "tight raw", geometry: "tight" },
], "damageTaken");
assert.equal(correctedFirstDigit.value, 57076, "The focused 57076 reading must beat low-confidence 27076 from wider crops");
assert.ok(correctedFirstDigit.confidence < 99, "Conflicting Damage Taken readings must remain highlighted for review");
assert.ok(selectLocalOcrDamageCandidate([
  { text: "10923", confidence: 95, mode: "wide binary", geometry: "safe-wide" },
  { text: "10923", confidence: 94, mode: "wide light", geometry: "safe-wide" },
  { text: "10923", confidence: 92, mode: "wide raw", geometry: "safe-wide" },
], "damage").confidence < 99, "Repeated preprocessing of one Damage crop must not masquerade as independent 99% evidence");
assert.equal(selectLocalOcrDamageCandidate([
  { text: "423", confidence: 96, mode: "wide binary", geometry: "safe-wide" },
], "damageTaken").value, null, "Suspiciously short Damage Taken values must stay empty for review instead of being auto-applied");
const trustedDuration = selectLocalOcrDurationCandidate([
  { text: "21:12", confidence: 96, mode: "binary" },
  { text: "Duration 21:12", confidence: 92, mode: "raw" },
  { text: "21.12", confidence: 90, mode: "light-140" },
]);
assert.equal(trustedDuration.value, "21:12");
assert.equal(trustedDuration.confidence, 99, "Three agreeing duration passes must reach the trusted-confidence gate");
const disputedRating = selectLocalOcrRatingCandidate([
  { text: "6.8", confidence: 96, mode: "light-120" },
  { text: "6.3", confidence: 93, mode: "light-135" },
]);
assert.equal(disputedRating.value, 6.8);
assert.equal(disputedRating.disagreement, true, "Conflicting IR candidates must remain highlighted for review");
const crossCheckedTeamKills = selectLocalTeamKillCandidate([
  { text: "3", confidence: 96, mode: "partial crop" },
  { text: "23", confidence: 78, mode: "full crop" },
], 23);
assert.equal(crossCheckedTeamKills.value, 23, "A complete Victory-side score confirmed by player kills must beat a higher-confidence partial digit");
assert.equal(crossCheckedTeamKills.crossChecked, true);
const correctedTeamKills = selectLocalTeamKillCandidate([
  { text: "27", confidence: 94, mode: "threshold 1" },
  { text: "27", confidence: 91, mode: "threshold 2" },
  { text: "22", confidence: 96, mode: "isolated raw crop" },
], 22);
assert.equal(correctedTeamKills.value, 22, "A real OCR reading confirmed by all five player kills must beat repeated decorative-crop noise");
assert.ok(correctedTeamKills.confidence >= 90);
assert.equal(selectLocalTeamKillCandidate([{ text: "", confidence: 0 }], 23).value, null, "Player kill totals must never replace a missing header OCR candidate");
const recoveredGold = selectLocalOcrIntegerCandidate([
  { text: "977", confidence: 96, mode: "binary" },
  { text: "10977", confidence: 96, mode: "raw" },
], "gold");
assert.equal(recoveredGold.value, 10977, "A clipped three-digit Gold reading must be rejected in favor of the complete value");
assert.ok(recoveredGold.confidence >= 90);
const angelaGoldCrop = buildLocalGoldFieldRectangles("right", 0.801)[0];
assert.ok(angelaGoldCrop.y > 0.74 && angelaGoldCrop.y + angelaGoldCrop.height < 0.77,
  "Angela's Gold crop must isolate the number above the fifth-row graphics");
assert.ok(rectangleContainsX(angelaGoldCrop, 0.58) && rectangleContainsX(angelaGoldCrop, 0.60));
const angelaGold = selectLocalOcrGoldCandidate([
  { text: "29649", confidence: 33, mode: "binary" },
  { text: "3969", confidence: 96, mode: "raw" },
  { text: "3969", confidence: 96, mode: "light-100" },
  { text: "3969", confidence: 94, mode: "light-120" },
]);
assert.equal(angelaGold.value, 3969, "Three clear readings must beat the weak 29649 hallucination");
assert.ok(angelaGold.confidence >= 90 && angelaGold.confidence < 99,
  "Gold with a weak conflicting pass needs review without being stuck at 54%");
const disputedGold = selectLocalOcrGoldCandidate([
  { text: "29649", confidence: 93, mode: "binary" },
  { text: "3969", confidence: 96, mode: "raw" },
  { text: "3969", confidence: 94, mode: "light-100" },
]);
assert.ok(disputedGold.confidence < 90, "Strong contradictory Gold OCR must remain uncertain");
assert.equal(selectLocalOcrIntegerCandidate([
  { text: "2", confidence: 30, mode: "binary" },
  { text: "3", confidence: 96, mode: "raw" },
  { text: "3", confidence: 94, mode: "light-100" },
], "kills").confidence, 95, "Clear K/D/A consensus may overcome a weak conflicting pass");
const recoveredGoldSequence = selectLocalOcrSequenceCandidate([
  { text: "977 5 4 13", confidence: 95, mode: "binary" },
  { text: "10977 5 4 13", confidence: 96, mode: "raw" },
], ["gold", "kills", "deaths", "assists"]);
assert.deepEqual(recoveredGoldSequence.values, [10977, 5, 4, 13]);
assert.equal(recoveredGoldSequence.complete, true);
assert.equal(selectLocalOcrSequenceCandidate([
  { text: "10977 5 4 13", confidence: 94, mode: "binary" },
  { text: "10977 5 4 18", confidence: 96, mode: "raw" },
], ["gold", "kills", "deaths", "assists"]).complete, false, "Conflicting complete row passes must fall back to individual field OCR");
assert.equal(classifyLocalResultScreenLabel("Equipment"), "data");
assert.equal(classifyLocalResultScreenLabel("EQUIPRnent"), "data");
assert.equal(classifyLocalResultScreenLabel("quipment"), "data", "A clipped Equipment label must still identify the Damage tab");
assert.equal(classifyLocalResultScreenLabel("Data"), "scoreboard");
assert.equal(classifyLocalResultScreenLabel(""), "");
assert.equal(classifyLocalResultScreenHeader("Hero Damage Damage Taken Teamfight Participation"), "data");
assert.equal(classifyLocalResultScreenHeader("DamageDamageTokeeSE"), "data", "Readable Damage header fragments must recover a hidden tab button");
assert.equal(classifyLocalResultScreenHeader("BamageDamageTakenPanicietion"), "data", "Common header glyph mistakes must still identify the Damage tab");
assert.equal(classifyLocalResultScreenHeader("Damage"), "", "One weak header word alone must not classify a result tab");
assert.equal(classifyLocalResultScreenHeader("Victory"), "");
assert.equal(classifyLocalMvpBadgeTone({ warmRatio: 0.14, purpleRatio: 0.005, brightRatio: 0.1, luminance: 0.4 }).tone, "bright");
assert.equal(classifyLocalMvpBadgeTone({ warmRatio: 0.1, purpleRatio: 0.065, brightRatio: 0.05, luminance: 0.3 }).tone, "dark");
assert.equal(classifyLocalMvpBadgeTone({ warmRatio: 0.02, purpleRatio: 0.01, brightRatio: 0.02, luminance: 0.25 }).tone, "");
const sampleBrightBadge = classifyLocalMvpBadgeTone({ warmRatio: 0.212, purpleRatio: 0.0068, brightRatio: 0.0448, luminance: 0.2797 });
const sampleDarkBadge = classifyLocalMvpBadgeTone({ warmRatio: 0.1625, purpleRatio: 0.0411, brightRatio: 0.0417, luminance: 0.2619 });
assert.equal(sampleBrightBadge.tone, "bright", "The supplied winning-side red-and-gold MVP badge must be recognized as bright");
assert.ok(sampleBrightBadge.confidence >= 90);
assert.equal(sampleDarkBadge.tone, "dark", "The supplied losing-side purple MVP badge must be recognized as dark");
const matchOneWinner = { warmRatio: 0.25, purpleRatio: 0.08, brightRatio: 0.065, luminance: 0.316 };
const matchOneLoser = { warmRatio: 0.167, purpleRatio: 0.113, brightRatio: 0.03, luminance: 0.278 };
const matchTwoWinner = { warmRatio: 0.257, purpleRatio: 0.007, brightRatio: 0.036, luminance: 0.295 };
const matchTwoLoser = { warmRatio: 0.189, purpleRatio: 0.004, brightRatio: 0.038, luminance: 0.266 };
assert.equal(classifyLocalMvpBadgeTone(matchOneWinner).tone, "bright", "Purple pixels in the winning badge must not make it a losing badge");
assert.equal(resolveLocalMatchOutcome({
  badgeMetrics: matchOneLoser, opponentBadgeMetrics: matchOneWinner,
  badgeCandidateConfidence: 82, opponentBadgeCandidateConfidence: 82,
}).result, "Loss", "Match 1: the right-side winner badge means EVOS on the left lost");
assert.equal(resolveLocalMatchOutcome({
  badgeMetrics: matchTwoLoser, opponentBadgeMetrics: matchTwoWinner,
  badgeCandidateConfidence: 82, opponentBadgeCandidateConfidence: 82,
}).result, "Loss", "Match 2: the left-side winner badge means EVOS on the right lost");
assert.deepEqual(resolveLocalMatchOutcome({
  badgeTone: "bright",
  badgeConfidence: 95,
  badgeCandidateConfidence: 92,
  opponentBadgeTone: "dark",
  opponentBadgeConfidence: 77,
  opponentBadgeCandidateConfidence: 87,
}), { result: "Win", confidence: 99, trusted: true, source: "both teams' MVP badges" });
assert.equal(resolveLocalMatchOutcome({
  badgeTone: "dark",
  badgeConfidence: 77,
  badgeCandidateConfidence: 87,
  opponentBadgeTone: "bright",
  opponentBadgeConfidence: 95,
  opponentBadgeCandidateConfidence: 92,
}).result, "Loss");
assert.equal(resolveLocalMatchOutcome({ headerOutcome: "leftWin", headerConfidence: 99 }).result, "", "The always-visible Victory header must never determine the match result");
assert.equal(resolveLocalMatchOutcome({}).result, "", "A missing badge must never become an automatic Loss");
assert.equal(calculateLocalTeamfightParticipation(3, 13, 22), 73);
assert.equal(calculateLocalTeamfightParticipation(0, 16, 22), 73);
assert.equal(calculateLocalTeamfightParticipation("", 16, 22), null);

const anomalies = findLocalScanAnomalies({
  teamKills: 12,
  opponentTeamKills: 8,
  rows: [
    { hero: "Joy", values: { kills: 13, deaths: 1, assists: 2, gold: 820 } },
    { hero: "Fredrinn", values: { kills: 0, deaths: 1, assists: 13, gold: 9000 } },
    { hero: "Novaria", values: { kills: 0, deaths: 1, assists: 2, gold: 8500 } },
    { hero: "Claude", values: { kills: 0, deaths: 1, assists: 2, gold: 10000 } },
    { hero: "Minotaur", values: { kills: 0, deaths: 1, assists: 2, gold: 7800 } },
  ],
});
assert.ok(anomalies.some((warning) => warning.includes("Gold 820 is suspiciously low")));
assert.ok(anomalies.some((warning) => warning.includes("Kills 13 cannot exceed")));
assert.ok(anomalies.some((warning) => warning.includes("Assists 13 cannot exceed")));
assert.ok(anomalies.some((warning) => warning.includes("would make TFP greater than 100%")));
assert.ok(anomalies.some((warning) => warning.includes("Player kills add up to 13")));
assert.ok(anomalies.some((warning) => warning.includes("Player deaths add up to 5")));
assert.deepEqual(findLocalScanAnomalies({ rows: [{ hero: "Joy", values: { gold: null, damage: null, damageTaken: null } }] }), []);

const swappedScreens = resolveLocalResultScreenKinds([
  { hint: "scoreboard", detectedKind: "data", file: { name: "damage.png" } },
  { hint: "data", detectedKind: "", file: { name: "combat.png" } },
]);
assert.deepEqual(swappedScreens.map((entry) => entry.kind), ["data", "scoreboard"]);
assert.equal(swappedScreens[1].detectionSource, "paired inference");
const decodedSource = { image: { width: 1920, height: 1080 }, release() {} };
const attachedDetection = attachLocalScreenDetection(
  { file: { name: "scoreboard.png" }, source: decodedSource, hint: "scoreboard" },
  { detectedKind: "scoreboard", raw: "Data", confidence: 91, source: "button-label" },
);
assert.equal(attachedDetection.source, decodedSource, "Screen-type metadata must never overwrite the decoded image source");
assert.equal(attachedDetection.detectedKind, "scoreboard");
assert.throws(() => resolveLocalResultScreenKinds([
  { hint: "scoreboard", detectedKind: "data" },
  { hint: "data", detectedKind: "data" },
]), /Both files look like the Damage screen/);

const assignment = solveHeroAssignment([
  [0.92, 0.12, 0.2],
  [0.15, 0.88, 0.31],
  [0.22, 0.28, 0.91],
]);
assert.deepEqual(assignment.assignment, [0, 1, 2]);
assert.ok(assignment.average > 0.9);
assert.ok(assignment.minimum >= 0.88);
assert.ok(assignment.margin > 0);

const globalBatchAssignment = resolveLocalBatchGameAssignments([
  [0.8, 0.79],
  [0.78, 0.5],
]);
assert.deepEqual(globalBatchAssignment.assignment, [1, 0], "Batch hero matching must optimize the whole session instead of greedily taking each file's first choice");
assert.ok(globalBatchAssignment.matches.every((match) => !match.ambiguous), "A globally stable batch assignment must be accepted");
const ambiguousBatchAssignment = resolveLocalBatchGameAssignments([
  [0.8, 0.8],
  [0.8, 0.8],
]);
assert.ok(ambiguousBatchAssignment.matches.every((match) => match.ambiguous), "Identical hero drafts must stay unassigned for manual review");
const duplicateScreenshotAssignment = resolveLocalBatchGameAssignments([
  [0.9],
  [0.89],
]);
assert.ok(duplicateScreenshotAssignment.matches.every((match) => match.ambiguous), "Near-duplicate screenshots competing for one game must not be auto-assigned");
const unknownKindWithTwoOpenSlots = resolveLocalBatchGameAssignments([[0.91, 0.91]]);
assert.ok(unknownKindWithTwoOpenSlots.matches.every((match) => match.ambiguous), "An unreadable tab label must stay manual while both result slots are open");
const unknownKindWithPairedSlot = resolveLocalBatchGameAssignments([[0.91]]);
assert.ok(unknownKindWithPairedSlot.matches.every((match) => !match.ambiguous), "An unreadable tab label may fill the sole complementary slot after its pair is matched");
const shuffledBatchAssignment = resolveLocalBatchGameAssignments([
  [null, null, 0.91],
  [0.89, null, null],
  [null, 0.88, null],
]);
assert.deepEqual(shuffledBatchAssignment.assignment, [2, 0, 1], "Screenshot picker order must not determine the destination game");

const picks = ["Joy", "Fredrinn", "Novaria", "Claude", "Minotaur"].map((hero, index) => ({ hero, player: `Player ${index + 1}` }));
const icons = Object.fromEntries(picks.map((pick) => [normalizeScannerHeroKey(pick.hero), `https://example.com/${pick.hero}.png`]));
assert.equal(validateLocalScannerDraft(picks, icons), "");
assert.match(validateLocalScannerDraft(picks.map((pick, index) => index === 2 ? { ...pick, player: "" } : pick), icons), /Assign a roster player/);
assert.match(validateLocalScannerDraft(picks, { ...icons, novaria: "" }), /Hero artwork is missing for Novaria/);

const mvpCandidate = resolveLocalMvpCandidate([
  { pickIndex: 0, ir: 7.8, irConfidence: 82, badgeMetrics: { visualScore: 0.12 } },
  { pickIndex: 1, ir: 6.4, irConfidence: 79, badgeMetrics: { visualScore: 0.1 } },
  { pickIndex: 2, ir: 11.2, irConfidence: 88, badgeMetrics: { visualScore: 0.2 } },
  { pickIndex: 3, ir: 8.1, irConfidence: 76, badgeMetrics: { visualScore: 0.11 } },
  { pickIndex: 4, ir: 7.3, irConfidence: 81, badgeMetrics: { visualScore: 0.09 } },
]);
assert.equal(mvpCandidate.pickIndex, 2);
assert.equal(mvpCandidate.trusted, true);
assert.equal(mvpCandidate.source, "MVP badge + IR");
const opponentBadgeCandidate = resolveLocalBadgeVisualCandidate([
  { rowIndex: 0, badgeMetrics: { visualScore: 0.1 } },
  { rowIndex: 1, badgeMetrics: { visualScore: 0.23 } },
  { rowIndex: 2, badgeMetrics: { visualScore: 0.09 } },
]);
assert.equal(opponentBadgeCandidate.candidate.rowIndex, 1, "Result detection must inspect the opposing team's MVP badge too");
assert.ok(opponentBadgeCandidate.confidence >= 70);
const strongToneBadgeCandidate = resolveLocalBadgeVisualCandidate([
  { rowIndex: 0, badgeMetrics: { visualScore: 0.205, warmRatio: 0.15, purpleRatio: 0.006, brightRatio: 0.05, luminance: 0.3 } },
  { rowIndex: 1, badgeMetrics: { visualScore: 0.17, warmRatio: 0.03, purpleRatio: 0.01, brightRatio: 0.02, luminance: 0.24 } },
  { rowIndex: 2, badgeMetrics: { visualScore: 0.16, warmRatio: 0.025, purpleRatio: 0.012, brightRatio: 0.018, luminance: 0.23 } },
]);
assert.equal(strongToneBadgeCandidate.candidate.rowIndex, 0, "A unique strong winning badge tone must survive a narrow visual-score gap");
assert.match(strongToneBadgeCandidate.reason, /strong MVP badge tone/);
const badgeOverridesWrongIr = resolveLocalMvpCandidate([
  { pickIndex: 0, ir: 11.6, irConfidence: 85, badgeMetrics: { visualScore: 0.1 } },
  { pickIndex: 1, ir: 7.2, irConfidence: 83, badgeMetrics: { visualScore: 0.22 } },
  { pickIndex: 2, ir: 8.4, irConfidence: 80, badgeMetrics: { visualScore: 0.11 } },
]);
assert.equal(badgeOverridesWrongIr.pickIndex, 1, "A distinctive MVP badge must override a conflicting OCR rating");
assert.equal(badgeOverridesWrongIr.trusted, false, "Badge and IR conflicts must remain visible for review");
assert.match(badgeOverridesWrongIr.reason, /conflicts with the highest IR/);
assert.equal(resolveLocalMvpCandidate([
  { pickIndex: 0, ir: 9.1, irConfidence: 80, badgeMetrics: { visualScore: 0.13 } },
  { pickIndex: 1, ir: 9.1, irConfidence: 80, badgeMetrics: { visualScore: 0.12 } },
]).pickIndex, null, "A non-distinctive badge must leave MVP optional even when ratings are present");
assert.equal(resolveLocalMvpCandidate([
  { pickIndex: 0, ir: null, irConfidence: 0 },
  { pickIndex: 1, ir: "", irConfidence: 0 },
]).pickIndex, null, "Missing ratings must not be converted to a zero-grade MVP candidate");

const scannerSource = await readFile(new URL("../src/lib/localResultScanner.js", import.meta.url), "utf8");
const scannerUiSource = await readFile(new URL("../src/components/LocalResultScanner.jsx", import.meta.url), "utf8");
const bootstrapWorkerSource = await readFile(new URL("../public/tesseract/local-worker.js", import.meta.url), "utf8");
const vercelConfig = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
assert.match(scannerSource, /workerPath = new URL\("\/tesseract\/local-worker\.js"/, "Scanner must use the guarded self-hosted OCR worker");
assert.match(scannerSource, /corePath = new URL\("\/tesseract"/, "Scanner must let Tesseract select a compatible core from the local directory");
assert.doesNotMatch(scannerSource, /corePath = new URL\([^\n]+\.js"/, "Scanner must not force one core build on every device");
assert.match(scannerSource, /workerBlobURL: false/, "Scanner must start the same-origin worker directly");
assert.match(scannerSource, /createWorker\("eng", 1, \{/, "Scanner must initialize Tesseract with the language code, not traineddata bytes");
assert.match(scannerSource, /cacheMethod: "none"/, "Scanner must not reuse stale Tesseract IndexedDB language data");
assert.doesNotMatch(scannerSource, /createWorker\(\[\{ code:/, "Scanner must not pass language bytes through the broken Tesseract v7 language-name path");
assert.match(scannerSource, /OCR_WORKER_INIT_TIMEOUT_MS = 60000/, "Scanner must stop a stalled OCR worker initialization");
assert.match(scannerSource, /OCR_RECOGNITION_TIMEOUT_MS = 20000/, "Scanner must stop a stalled OCR recognition pass");
assert.match(scannerSource, /SCAN_MAX_RUNTIME_MS = 120000/, "Scanner must have a total runtime safety limit");
assert.match(scannerSource, /OCR_TARGET_CONFIDENCE = 99/, "Scanner must reserve trusted confidence for the 99% consensus gate");
assert.match(scannerSource, /export async function rescanLocalResultField/, "Scanner must support focused per-field OCR retries");
assert.match(scannerSource, /buildLocalDamageFieldRectangles/, "Damage scanning must use guarded multi-geometry crops");
assert.match(scannerSource, /recognizeDamageField/, "Damage scanning and focused retries must share the hardened OCR path");
assert.match(scannerSource, /signal: externalSignal/, "Scanner must support cancellation from the UI");
assert.match(scannerSource, /export async function assignLocalBatchResultScreens/, "Batch scanning must preflight screen type and hero drafts before assigning files");
assert.match(scannerSource, /button-label/, "Screen type OCR must isolate the Data or Equipment text from the menu icon and NEW badge");
assert.match(scannerSource, /native-raw/, "Screen type OCR must preserve native label pixels instead of relying only on blurred upscaling");
assert.match(scannerSource, /data-column-header/, "Screen type OCR must inspect Damage column headings when the bottom tab button is unavailable");
assert.match(scannerSource, /paired hero inference/, "An unreadable screen label must be recoverable only through a unique complementary hero-draft slot");
assert.match(scannerSource, /errorHandler:/, "Scanner must surface Tesseract worker startup failures");
assert.match(bootstrapWorkerSource, /unhandledrejection/, "Bootstrap worker must capture rejected WebAssembly initialization");
assert.match(bootstrapWorkerSource, /status: "reject"/, "Bootstrap worker must forward failures through the Tesseract response channel");
assert.match(bootstrapWorkerSource, /self\.close\(\)/, "Bootstrap worker must close after an unrecoverable initialization failure");
assert.match(bootstrapWorkerSource, /importScripts\("\.\/worker\.min\.js"\)/, "Bootstrap worker must load the vendored Tesseract worker");

function createBootstrapWorkerHarness() {
  const listeners = new Map();
  const posted = [];
  let closed = false;
  let importedScript = "";
  const workerGlobal = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    postMessage(message) {
      posted.push(message);
    },
    close() {
      closed = true;
    },
    importScripts(path) {
      importedScript = path;
    },
  };
  workerGlobal.self = workerGlobal;
  vm.runInNewContext(bootstrapWorkerSource, workerGlobal, { filename: "local-worker.js" });
  return {
    listeners,
    posted,
    get closed() { return closed; },
    get importedScript() { return importedScript; },
  };
}

const rejectedBootstrap = createBootstrapWorkerHarness();
rejectedBootstrap.listeners.get("message")({
  data: { workerId: "worker-1", jobId: "job-1", action: "load" },
});
let rejectionPrevented = false;
rejectedBootstrap.listeners.get("unhandledrejection")({
  reason: "core compile failed",
  preventDefault() { rejectionPrevented = true; },
});
assert.equal(rejectedBootstrap.importedScript, "./worker.min.js");
assert.equal(rejectionPrevented, true);
assert.deepEqual(JSON.parse(JSON.stringify(rejectedBootstrap.posted)), [{
  workerId: "worker-1",
  jobId: "job-1",
  action: "load",
  status: "reject",
  data: "WebAssembly initialization failed: core compile failed",
}]);
assert.equal(rejectedBootstrap.closed, true);

const completedBootstrap = createBootstrapWorkerHarness();
completedBootstrap.listeners.get("message")({
  data: { workerId: "worker-2", jobId: "job-2", action: "load" },
});
completedBootstrap.listeners.get("message")({
  data: { workerId: "worker-2", jobId: "job-3", action: "loadLanguage" },
});
completedBootstrap.listeners.get("unhandledrejection")({
  reason: "unrelated rejection",
  preventDefault() { throw new Error("Completed bootstrap rejection must not be intercepted"); },
});
assert.deepEqual(completedBootstrap.posted, []);
assert.equal(completedBootstrap.closed, false);
assert.match(vercelConfig, /script-src 'self' 'wasm-unsafe-eval'/, "Production CSP must allow the local Tesseract WebAssembly core to compile");
assert.doesNotMatch(scannerSource, /cdn\.jsdelivr|unpkg/, "Scanner implementation must not depend on an OCR CDN");
assert.match(scannerSource, /iconCenterX: \{ left: 0\.133, right: 0\.868 \}/, "Scanner must retain the calibrated 16:9 hero centers");
assert.match(scannerSource, /valueYOffset: -0\.04/, "K/D/A scanning must stay above the item row and chat overlays");
assert.match(scannerSource, /standard: \{\s+left: \{ x: 0\.286, y: 0\.044, width: 0\.048, height: 0\.08 \},\s+right: \{ x: 0\.663, y: 0\.044, width: 0\.048, height: 0\.08 \}/, "Standard 16:9 team-kill OCR must isolate both score digits from decorative header lines");
assert.match(scannerSource, /ultraWide: \{\s+left: \{ x: 0\.319, y: 0\.024, width: 0\.05, height: 0\.08 \},\s+right: \{ x: 0\.631, y: 0\.024, width: 0\.05, height: 0\.08 \}/, "Ultra-wide captures must retain their closer Victory-side score positions");
assert.match(scannerSource, /centerX: \{ left: 0\.455, right: 0\.545 \},\s+width: 0\.048,\s+yOffset: 0\.032,\s+height: 0\.052/, "Standard 16:9 IR OCR must target the grade beneath each badge");
assert.match(scannerSource, /createOcrCanvas\(image, rectangle, mode\)/, "IR and team scores must use calibrated fixed light-text thresholds");
assert.match(scannerSource, /centerX: \{ left: 0\.45, right: 0\.55 \},\s+width: 0\.06,\s+yOffset: 0,\s+height: 0\.08/, "MVP analysis must target the badge centered on each player row");
assert.match(scannerSource, /parseLocalOcrRating/, "Scanner must parse per-player IR grades");
assert.match(scannerSource, /resolveLocalMvpCandidate/, "Scanner must resolve MVP candidates from rating and badge evidence");
assert.match(scannerSource, /opponentBadgeResolution/, "Scanner must compare MVP badge evidence from both teams");
assert.match(scannerSource, /badgeCandidateConfidence: scoreboardResult\.mvpResolution\?\.visualConfidence/, "Match outcome must use badge-only confidence instead of being suppressed by conflicting IR OCR");
assert.doesNotMatch(scannerSource, /outcomeHeader|recognizeOutcomeHeader|classifyLocalOutcomeLabel/, "The always-visible Victory header must not influence Win or Loss");
assert.match(scannerUiSource, /Drop, paste, or choose screenshot/, "Scanner inputs must support paste and drag/drop guidance");
assert.match(scannerUiSource, /onDrop=/, "Scanner inputs must accept drag-and-drop screenshots");
assert.match(scannerUiSource, /onPaste=/, "Scanner inputs must accept pasted screenshots");
assert.match(scannerUiSource, /export function BatchLocalResultScanner/, "Scanner must expose a session batch workflow");
assert.match(scannerUiSource, /Auto-match screenshots by hero draft/, "Batch upload must explain that files are matched from their five heroes");
assert.doesNotMatch(scannerUiSource, /fillFilesInOrder|Files are assigned in order/, "Batch upload must never depend on file-picker order");
assert.match(scannerUiSource, /Focused re-scan/, "Review must expose focused per-field re-scanning");
assert.match(scannerUiSource, /not a claimed 99% measured accuracy/, "The UI must explain the difference between a confidence gate and measured accuracy");
assert.match(scannerUiSource, /review score = raw OCR confidence × 1\.7/i, "Review must disclose the 1.7 multiplier");
assert.match(scannerUiSource, /allFieldConfidences\.filter\(\(confidence\) => confidence >= TRUSTED_CONFIDENCE\)/, "Trusted values must keep using raw OCR confidence");
assert.match(scannerUiSource, /confidence >= TRUSTED_CONFIDENCE \? "good" : "low"/, "Review styling must keep using the original trusted gate");
assert.match(scannerUiSource, /OCR raw: \{displayOcrRaw\(result\.durationRaw\)\}/, "Duration review must expose its selected OCR raw text");
assert.match(scannerUiSource, /OCR raw: \{displayOcrRaw\(result\.teamKillsRaw\)\}/, "Team-kill review must expose its selected OCR raw text");
assert.match(scannerUiSource, /Uploaded screenshots/, "Review must expose the uploaded source screenshots for visual cross-checking");
assert.match(scannerUiSource, /Full uploaded \$\{activeSource\.label\} screenshot/, "Uploaded screenshots must open in a full-size viewer");
assert.match(scannerUiSource, /event\.key === "Escape"/, "The full-size screenshot viewer must close with Escape");

const localRuntimeAssets = [
  "../public/tesseract/local-worker.js",
  "../public/tesseract/worker.min.js",
  "../public/tesseract/tesseract-core-lstm.wasm.js",
  "../public/tesseract/tesseract-core-simd-lstm.wasm.js",
  "../public/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js",
  "../public/tessdata/eng.traineddata.gz",
];
for (const asset of localRuntimeAssets) {
  const url = new URL(asset, import.meta.url);
  await access(url);
  assert.ok((await stat(url)).size > 0, `${asset} must be a non-empty local OCR runtime asset`);
}

console.log("Local result scanner tests passed: multi-geometry Damage OCR, 99% consensus gate, batch review, focused retries, and OCR safety are stable.");
