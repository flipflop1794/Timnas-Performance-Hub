import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CircleCheck, ImagePlus, LoaderCircle, ScanLine, ShieldCheck, TriangleAlert, X } from "lucide-react";
import ResponsiveSelect from "./ResponsiveSelect";
import { appendOcrQualitySamples, buildOcrQualitySamples } from "../lib/ocrQualityLab";
import {
  assignLocalBatchResultScreens,
  calculateLocalTeamfightParticipation,
  findLocalScanAnomalies,
  formatLocalDurationEntry,
  normalizeScannerHeroKey,
  parseLocalOcrDuration,
  rescanLocalResultField,
  scaleLocalOcrReviewScore,
  scanLocalResultScreens,
  validateLocalScannerDraft,
} from "../lib/localResultScanner";

const TRUSTED_CONFIDENCE = 99;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const FIELD_LABELS = {
  kills: "K",
  deaths: "D",
  assists: "A",
  gold: "Gold",
  damage: "Damage",
  damageTaken: "Damage taken",
  ir: "IR",
};

function displayOcrRaw(value) {
  return String(value || "").replace(/\s+/g, " ").trim() || "not read";
}

function useObjectUrl(file) {
  const url = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

function imageFilesFromList(files) {
  return Array.from(files || []).filter((file) => ACCEPTED_IMAGE_TYPES.has(String(file?.type || "").toLowerCase()));
}

function ScreenshotInput({ id, label, description, file, onChange, multiple = false, onFiles, disabled = false }) {
  const [dragging, setDragging] = useState(false);
  const previewUrl = useObjectUrl(file);
  const receiveFiles = (files) => {
    if (disabled) return;
    const images = imageFilesFromList(files);
    if (!images.length) return;
    if (multiple) onFiles?.(images);
    else onChange?.(images[0]);
  };
  const receivePaste = (event) => {
    const itemFiles = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === "file" && String(item.type || "").startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    const images = itemFiles.length ? itemFiles : imageFilesFromList(event.clipboardData?.files);
    if (!images.length) return;
    event.preventDefault();
    receiveFiles(images);
  };

  return (
    <div
      className={`local-scan-file${file ? " has-file" : ""}${dragging ? " is-dragging" : ""}${disabled ? " is-disabled" : ""}`}
      tabIndex={disabled ? -1 : 0}
      onPaste={receivePaste}
      onDragEnter={(event) => { if (!disabled) { event.preventDefault(); setDragging(true); } }}
      onDragOver={(event) => { if (!disabled) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); } }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        receiveFiles(event.dataTransfer.files);
      }}
    >
      <div className="local-scan-file-copy">
        <strong>{label}</strong>
        <small>{description}</small>
        <small className="local-scan-file-hint">Drop, paste, or choose screenshot{multiple ? "s" : ""}</small>
      </div>
      {file && (
        <div className="local-scan-file-preview">
          <img src={previewUrl} alt={`Local preview of ${label}`} />
          <span title={file.name}>{file.name}</span>
        </div>
      )}
      <label
        className="local-scan-file-action"
        htmlFor={disabled ? undefined : id}
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          document.getElementById(id)?.click();
        }}
      >
        <ImagePlus size={15} aria-hidden="true" /> {file ? "Replace" : multiple ? "Choose screenshots" : "Choose screenshot"}
      </label>
      <input
        id={id}
        type="file"
        disabled={disabled}
        multiple={multiple}
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          receiveFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function UploadedScreenshotCard({ kind, file, onOpen }) {
  const previewUrl = useObjectUrl(file);
  const label = kind === "scoreboard" ? "K/D/A + Gold" : "Damage";
  return (
    <button type="button" className="local-scan-source-card" onClick={(event) => onOpen({ kind, file, label, trigger: event.currentTarget })}>
      <img src={previewUrl} alt="" />
      <span><strong>{label}</strong><small>{file.name || "Uploaded screenshot"}</small></span>
      <span className="local-scan-source-action">View screenshot</span>
    </button>
  );
}

function SourceScreenshotViewer({ sourceFiles = {} }) {
  const [activeSource, setActiveSource] = useState(null);
  const closeButtonRef = useRef(null);
  const sectionTitleId = useId();
  const dialogTitleId = useId();
  const fullPreviewUrl = useObjectUrl(activeSource?.file);
  const entries = Object.entries(sourceFiles).filter(([, file]) => file);

  useEffect(() => {
    if (!activeSource) return;
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
  }, [activeSource]);

  const closeSource = () => {
    const trigger = activeSource?.trigger;
    setActiveSource(null);
    window.requestAnimationFrame(() => trigger?.focus());
  };

  if (!entries.length) return null;
  return (
    <>
      <section className="local-scan-sources" aria-labelledby={sectionTitleId}>
        <div className="local-scan-sources-header">
          <strong id={sectionTitleId}>Uploaded screenshots</strong>
          <small>Open the original local files to cross-check OCR before applying.</small>
        </div>
        <div className="local-scan-source-grid">
          {entries.map(([kind, file]) => <UploadedScreenshotCard key={kind} kind={kind} file={file} onOpen={setActiveSource} />)}
        </div>
      </section>
      {activeSource && (
        <div
          className="local-scan-source-overlay"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeSource(); }}
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              closeButtonRef.current?.focus();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              closeSource();
            }
          }}
        >
          <div className="local-scan-source-dialog" role="dialog" aria-modal="true" aria-labelledby={dialogTitleId}>
            <div className="local-scan-source-dialog-header">
              <div><strong id={dialogTitleId}>{activeSource.label} screenshot</strong><small>{activeSource.file.name || "Uploaded screenshot"} · stays on this device</small></div>
              <button ref={closeButtonRef} type="button" onClick={closeSource} aria-label="Close screenshot viewer"><X size={19} /></button>
            </div>
            <div className="local-scan-source-full"><img src={fullPreviewUrl} alt={`Full uploaded ${activeSource.label} screenshot`} /></div>
          </div>
        </div>
      )}
    </>
  );
}

function minimumConfidence(row, fields, includeIr) {
  const values = fields.map((field) => row.fieldConfidence[field] || 0);
  if (includeIr) values.push(row.irConfidence || 0);
  return values.length ? Math.min(...values.filter((value) => Number.isFinite(value))) : 0;
}

function EvidenceCrop({ file, evidence, label, confidence, raw, rescanning, status, onRescan }) {
  const canvasRef = useRef(null);
  const previewUrl = useObjectUrl(file);
  const rectangle = evidence?.rectangle;

  useEffect(() => {
    if (!previewUrl || !rectangle || !canvasRef.current) return undefined;
    let cancelled = false;
    const sourceImage = new Image();
    sourceImage.onload = () => {
      if (cancelled || !canvasRef.current) return;
      const paddingX = rectangle.width * 0.7;
      const paddingY = rectangle.height * 1.2;
      const normalizedX = Math.max(0, rectangle.x - paddingX);
      const normalizedY = Math.max(0, rectangle.y - paddingY);
      const normalizedWidth = Math.min(1 - normalizedX, rectangle.width + paddingX * 2);
      const normalizedHeight = Math.min(1 - normalizedY, rectangle.height + paddingY * 2);
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      canvas.width = 560;
      canvas.height = 180;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        sourceImage,
        normalizedX * sourceImage.naturalWidth,
        normalizedY * sourceImage.naturalHeight,
        normalizedWidth * sourceImage.naturalWidth,
        normalizedHeight * sourceImage.naturalHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
    };
    sourceImage.src = previewUrl;
    return () => {
      cancelled = true;
      sourceImage.onload = null;
    };
  }, [previewUrl, rectangle]);

  if (!evidence) {
    return (
      <div className="local-scan-evidence empty">
        <strong>Focused evidence</strong>
        <span>Select a scanned value to inspect its exact screenshot crop.</span>
      </div>
    );
  }

  return (
    <div className="local-scan-evidence">
      <div className="local-scan-evidence-header">
        <div>
          <strong>{label}</strong>
          <small>Review score {scaleLocalOcrReviewScore(confidence)} · raw OCR confidence {confidence}% · OCR raw: {raw || "not read"}</small>
        </div>
        <button type="button" onClick={onRescan} disabled={!file || rescanning}>
          {rescanning ? <LoaderCircle className="local-scan-spinner" size={14} /> : <ScanLine size={14} />}
          {rescanning ? "Re-scanning…" : "Focused re-scan"}
        </button>
      </div>
      {file ? <canvas ref={canvasRef} role="img" aria-label={`Screenshot crop for ${label}`} /> : <span>The local source screenshot is no longer available.</span>}
      {status && <small className="local-scan-evidence-status" aria-live="polite">{status}</small>}
    </div>
  );
}

function LocalScanResultReview({ result, game, heroIcons, onApply, onApplied, qualityScope, applied = false, applyLabel = "Apply scanned game results" }) {
  const [reviewRows, setReviewRows] = useState([]);
  const [duration, setDuration] = useState("");
  const [teamKills, setTeamKills] = useState("");
  const [opponentTeamKills, setOpponentTeamKills] = useState("");
  const [matchResult, setMatchResult] = useState("");
  const [mvpPickIndex, setMvpPickIndex] = useState("");
  const [verified, setVerified] = useState(false);
  const [labVerified, setLabVerified] = useState(false);
  const [selectedCell, setSelectedCell] = useState(null);
  const [rescanStatus, setRescanStatus] = useState("");
  const [rescanning, setRescanning] = useState(false);
  const rescanAbortRef = useRef(null);
  const initialGameDurationRef = useRef(game.duration);

  useEffect(() => {
    setDuration(result.duration || initialGameDurationRef.current || "");
    setTeamKills(result.teamKills === null || result.teamKills === undefined ? "" : String(result.teamKills));
    setOpponentTeamKills(result.opponentTeamKills === null || result.opponentTeamKills === undefined ? "" : String(result.opponentTeamKills));
    setMatchResult(result.result || "");
    setMvpPickIndex(result.mvpPickIndex === null || result.mvpPickIndex === undefined ? "" : String(result.mvpPickIndex));
    setReviewRows(result.rows.map((row) => ({
      ...row,
      ir: row.ir === null ? "" : String(row.ir),
      evidence: { ...(row.evidence || {}) },
      values: Object.fromEntries(Object.entries(row.values).map(([field, value]) => [field, value === null ? "" : String(value)])),
    })));
    const firstField = result.requiredFields?.[0] || (result.detectedKinds?.includes("scoreboard") ? "ir" : "");
    setSelectedCell(firstField && result.rows[0] ? { pickIndex: result.rows[0].pickIndex, field: firstField } : null);
    setVerified(false);
    setLabVerified(false);
    setRescanStatus("");
  }, [result]);

  useEffect(() => () => rescanAbortRef.current?.abort(), []);

  const updateReviewValue = (pickIndex, field, value) => {
    setVerified(false);
    setLabVerified(false);
    if (field === "ir") {
      const normalized = String(value || "").replace(",", ".").replace(/[^0-9.]/g, "");
      const firstDot = normalized.indexOf(".");
      const cleaned = firstDot < 0
        ? normalized.slice(0, 2)
        : `${normalized.slice(0, firstDot).slice(0, 2)}.${normalized.slice(firstDot + 1).replace(/\./g, "").slice(0, 1)}`;
      setReviewRows((rows) => rows.map((row) => row.pickIndex === pickIndex ? { ...row, ir: cleaned, irConfidence: 0 } : row));
      return;
    }
    const digits = String(value || "").replace(/\D/g, "");
    setReviewRows((rows) => rows.map((row) => row.pickIndex === pickIndex
      ? { ...row, values: { ...row.values, [field]: digits }, fieldConfidence: { ...row.fieldConfidence, [field]: 0 } }
      : row));
  };

  const requiredFields = result.requiredFields || [];
  const hasScoreboard = Boolean(result.detectedKinds?.includes("scoreboard"));
  const showTeamfightParticipation = requiredFields.includes("kills") && requiredFields.includes("assists");
  const reviewedKillValues = reviewRows.map((row) => row.values.kills === "" ? null : Number(row.values.kills));
  const reviewedTeamKills = showTeamfightParticipation && reviewedKillValues.every(Number.isSafeInteger)
    ? reviewedKillValues.reduce((total, value) => total + value, 0)
    : null;
  const reviewedHeaderTeamKills = teamKills === "" ? null : Number(teamKills);
  const reviewedOpponentTeamKills = opponentTeamKills === "" ? null : Number(opponentTeamKills);
  const killCheckMismatch = reviewedHeaderTeamKills !== null && reviewedTeamKills !== null && reviewedHeaderTeamKills !== reviewedTeamKills;
  const teamfightKillBase = reviewedHeaderTeamKills;
  const durationComplete = !hasScoreboard || Boolean(parseLocalOcrDuration(duration));
  const teamKillsComplete = !hasScoreboard || (Number.isSafeInteger(reviewedHeaderTeamKills) && reviewedHeaderTeamKills >= 0 && reviewedHeaderTeamKills <= 99);
  const opponentTeamKillsComplete = !hasScoreboard || reviewedOpponentTeamKills === null
    || (Number.isSafeInteger(reviewedOpponentTeamKills) && reviewedOpponentTeamKills >= 0 && reviewedOpponentTeamKills <= 99);
  const resultComplete = !hasScoreboard || matchResult === "Win" || matchResult === "Loss";
  const ratingsComplete = !hasScoreboard || reviewRows.every((row) => {
    const value = Number(row.ir);
    return row.ir !== "" && Number.isFinite(value) && value >= 3 && value <= 20;
  });
  const reviewComplete = durationComplete && teamKillsComplete && opponentTeamKillsComplete && resultComplete && ratingsComplete && reviewRows.every((row) => requiredFields.every((field) => {
    const value = row.values[field];
    return value !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
  }));
  const reviewedRowsForValidation = reviewRows.map((row) => ({
    ...row,
    values: Object.fromEntries(Object.entries(row.values).map(([field, value]) => [field, value === "" ? null : Number(value)])),
  }));
  const dynamicAnomalies = hasScoreboard
    ? findLocalScanAnomalies({ rows: reviewedRowsForValidation, teamKills: reviewedHeaderTeamKills, opponentTeamKills: reviewedOpponentTeamKills })
    : findLocalScanAnomalies({ rows: reviewedRowsForValidation });
  const initialWarnings = result.warnings || [];
  const newDynamicWarnings = dynamicAnomalies.filter((warning) => !initialWarnings.some((initialWarning) => initialWarning.endsWith(warning)));
  const reviewWarnings = [...new Set([...initialWarnings, ...newDynamicWarnings.map((warning) => `Reviewed data anomaly: ${warning}`)])];
  if (killCheckMismatch && !reviewWarnings.some((warning) => warning.includes("Player kills add up"))) {
    reviewWarnings.push(`Player kills add up to ${reviewedTeamKills}, but the reviewed team score is ${reviewedHeaderTeamKills}.`);
  }
  const allFieldConfidences = reviewRows.flatMap((row) => [
    ...requiredFields.map((field) => row.fieldConfidence[field] || 0),
    ...(hasScoreboard ? [row.irConfidence || 0] : []),
  ]);
  const trustedValues = allFieldConfidences.filter((confidence) => confidence >= TRUSTED_CONFIDENCE).length;
  const belowTrustedGate = allFieldConfidences.some((confidence) => confidence < TRUSTED_CONFIDENCE)
    || (hasScoreboard && (result.durationConfidence < TRUSTED_CONFIDENCE
      || result.teamKillsConfidence < TRUSTED_CONFIDENCE
      || (reviewedOpponentTeamKills !== null && result.opponentTeamKillsConfidence < TRUSTED_CONFIDENCE)
      || result.resultConfidence < TRUSTED_CONFIDENCE));
  const mvpChanged = hasScoreboard && String(mvpPickIndex) !== String(result.mvpPickIndex ?? "");
  if (mvpChanged) reviewWarnings.push("MVP selection was changed manually. Check it against the screenshot before applying.");
  else if (hasScoreboard && mvpPickIndex && !result.mvpTrusted) reviewWarnings.push("MVP badge needs manual verification against the screenshot.");
  const needsVerification = Boolean(reviewWarnings.length || belowTrustedGate);
  const canApply = reviewComplete && (!needsVerification || verified) && !rescanning && !applied;

  const selectedRow = reviewRows.find((row) => row.pickIndex === selectedCell?.pickIndex);
  const selectedEvidence = selectedRow?.evidence?.[selectedCell?.field];
  const selectedConfidence = selectedCell?.field === "ir" ? selectedRow?.irConfidence || 0 : selectedRow?.fieldConfidence?.[selectedCell?.field] || 0;
  const selectedRaw = selectedCell?.field === "ir" ? selectedRow?.irRaw || "" : selectedRow?.raw?.[selectedCell?.field] || "";
  const selectedFile = selectedEvidence ? result.sourceFiles?.[selectedEvidence.sourceKind] : null;
  const selectedLabel = selectedRow && selectedCell ? `${selectedRow.player} · ${selectedRow.hero} · ${FIELD_LABELS[selectedCell.field] || selectedCell.field}` : "Focused evidence";

  const runFocusedRescan = async () => {
    if (!selectedRow || !selectedEvidence || !selectedFile || !selectedCell) return;
    rescanAbortRef.current?.abort();
    const controller = new AbortController();
    rescanAbortRef.current = controller;
    setRescanning(true);
    setRescanStatus("Preparing focused OCR…");
    try {
      const rescanned = await rescanLocalResultField({
        file: selectedFile,
        kind: selectedEvidence.sourceKind,
        side: selectedEvidence.side,
        rowIndex: selectedEvidence.rowIndex,
        field: selectedCell.field,
        signal: controller.signal,
        onProgress: setRescanStatus,
      });
      if (rescanned.value === null || rescanned.value === "") throw new Error("The focused pass still could not read this value. Enter it manually from the crop.");
      setReviewRows((rows) => rows.map((row) => {
        if (row.pickIndex !== selectedCell.pickIndex) return row;
        if (selectedCell.field === "ir") {
          return { ...row, ir: String(rescanned.value), irConfidence: Math.round(rescanned.confidence), irRaw: rescanned.raw, irDisagreement: rescanned.disagreement, evidence: { ...row.evidence, ir: rescanned.evidence } };
        }
        return {
          ...row,
          values: { ...row.values, [selectedCell.field]: String(rescanned.value) },
          fieldConfidence: { ...row.fieldConfidence, [selectedCell.field]: Math.round(rescanned.confidence) },
          raw: { ...row.raw, [selectedCell.field]: rescanned.raw },
          evidence: { ...row.evidence, [selectedCell.field]: rescanned.evidence },
        };
      }));
      setVerified(false);
      setLabVerified(false);
      setRescanStatus(`Focused re-scan complete · review score ${scaleLocalOcrReviewScore(rescanned.confidence)} · raw OCR confidence ${Math.round(rescanned.confidence)}%.`);
    } catch (error) {
      if (!controller.signal.aborted) setRescanStatus(error instanceof Error ? error.message : "Focused re-scan failed.");
    } finally {
      if (rescanAbortRef.current === controller) rescanAbortRef.current = null;
      setRescanning(false);
    }
  };

  const applyResults = () => {
    if (!canApply) return;
    const mvpRow = reviewRows.find((row) => String(row.pickIndex) === String(mvpPickIndex));
    const payload = {
      rows: reviewRows.map((row) => ({
        pickIndex: row.pickIndex,
        hero: row.hero,
        player: row.player,
        playerId: row.playerId || "",
        ir: hasScoreboard ? row.ir : undefined,
        values: Object.fromEntries(requiredFields.map((field) => [field, row.values[field]])),
      })),
      duration: parseLocalOcrDuration(duration) || duration,
      result: hasScoreboard ? matchResult : "",
      mvp: hasScoreboard ? mvpRow?.player || "" : "",
      mvpPlayerId: hasScoreboard ? mvpRow?.playerId || "" : "",
      teamKills: hasScoreboard ? reviewedHeaderTeamKills : null,
      opponentTeamKills: hasScoreboard ? reviewedOpponentTeamKills : null,
      scanReview: { checkedAgainstScreenshot: labVerified, reviewedAt: new Date().toISOString() },
    };
    if (onApply(payload) === false) return;
    if (labVerified) {
      try { appendOcrQualitySamples(qualityScope, buildOcrQualitySamples(result, payload)); }
      catch { window.alert("Quality Lab could not save on this device. The reviewed values were still applied to the form."); }
    }
    onApplied?.();
  };

  return (
    <div className="local-scan-review">
      <div className="local-scan-review-header">
        <div><strong>Review before applying</strong><small>Trusted means three OCR passes agree, or the value has an independent cross-check. Lower values stay highlighted.</small></div>
        <div className="local-scan-diagnostics">
          {(result.diagnostics || []).map((diagnostic) => (
            <span key={diagnostic.kind} className={diagnostic.trusted ? "trusted" : "warning"} title={`${diagnostic.fileName} · ${diagnostic.detectionSource}`}>
              {diagnostic.kind === "scoreboard" ? "K/D/A + Gold" : "Damage"}: {diagnostic.side} · heroes {diagnostic.heroConfidence}%
            </span>
          ))}
          <span className={trustedValues === allFieldConfidences.length ? "trusted" : "warning"}>Trusted values: {trustedValues}/{allFieldConfidences.length}</span>
        </div>
      </div>

      <div className="local-scan-confidence-note"><ShieldCheck size={15} /><span><strong>Review score = raw OCR confidence × 1.7, capped at 98 until trusted.</strong> The original OCR confidence still controls warnings and the 99% trusted-confidence gate. This score is not measured accuracy; the gate is not a claimed 99% measured accuracy until validated against a labelled screenshot set.</span></div>

      <SourceScreenshotViewer sourceFiles={result.sourceFiles} />

      <div className="local-scan-review-table-wrap">
        <table className="local-scan-review-table">
          <thead><tr><th>Player · hero</th>{requiredFields.map((field) => <th key={field}>{FIELD_LABELS[field]}</th>)}{hasScoreboard && <th>IR</th>}{showTeamfightParticipation && <th title="Calculated from (Kills + Assists) / team kills">TFP</th>}<th title="Review score is 1.7 times the lowest raw OCR confidence, capped at 98 until trusted">Review score</th></tr></thead>
          <tbody>
            {reviewRows.map((row) => {
              const confidence = minimumConfidence(row, requiredFields, hasScoreboard);
              const iconUrl = heroIcons[normalizeScannerHeroKey(row.hero)] || "";
              const teamfightParticipation = calculateLocalTeamfightParticipation(row.values.kills, row.values.assists, teamfightKillBase);
              return (
                <tr key={row.pickIndex}>
                  <td data-label="Player"><span className="local-scan-player">{iconUrl && <img src={iconUrl} alt="" width="30" height="30" />}<span><strong>{row.player}</strong><small>{row.hero}</small></span></span></td>
                  {requiredFields.map((field) => {
                    const lowConfidence = (row.fieldConfidence[field] || 0) < TRUSTED_CONFIDENCE || row.values[field] === "";
                    return <td key={field} data-label={FIELD_LABELS[field]}><input type="text" inputMode="numeric" value={row.values[field] ?? ""} onFocus={() => { setSelectedCell({ pickIndex: row.pickIndex, field }); setRescanStatus(""); }} onChange={(event) => updateReviewValue(row.pickIndex, field, event.target.value)} className={lowConfidence ? "needs-review" : ""} aria-label={`${FIELD_LABELS[field]} for ${row.player} using ${row.hero}`} title={`Review score ${scaleLocalOcrReviewScore(row.fieldConfidence[field])} · raw OCR confidence ${row.fieldConfidence[field] || 0}%`} /></td>;
                  })}
                  {hasScoreboard && <td data-label="IR"><input type="text" inputMode="decimal" value={row.ir ?? ""} onFocus={() => { setSelectedCell({ pickIndex: row.pickIndex, field: "ir" }); setRescanStatus(""); }} onChange={(event) => updateReviewValue(row.pickIndex, "ir", event.target.value)} className={!row.ir || Number(row.ir) < 3 || Number(row.ir) > 20 || (row.irConfidence || 0) < TRUSTED_CONFIDENCE ? "needs-review" : ""} aria-label={`IR grade for ${row.player} using ${row.hero}`} title={`Review score ${scaleLocalOcrReviewScore(row.irConfidence)} · raw OCR confidence ${row.irConfidence || 0}%`} /></td>}
                  {showTeamfightParticipation && <td data-label="TFP"><span className="local-scan-derived" title="Calculated from Kills + Assists divided by team kills">{teamfightParticipation === null ? "—" : `${teamfightParticipation}%`}</span></td>}
                  <td data-label="Review score"><span className={`local-scan-confidence ${confidence >= TRUSTED_CONFIDENCE ? "good" : "low"}`} title={`Raw OCR confidence ${confidence}%`}>{scaleLocalOcrReviewScore(confidence)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EvidenceCrop file={selectedFile} evidence={selectedEvidence} label={selectedLabel} confidence={selectedConfidence} raw={selectedRaw} rescanning={rescanning} status={rescanStatus} onRescan={runFocusedRescan} />

      {hasScoreboard && (
        <div className="local-scan-game-summary">
          <div className="sl-scan-choice-field"><span>Result</span><ResponsiveSelect label="Result" value={matchResult} onChange={(event) => { setMatchResult(event.target.value); setVerified(false); setLabVerified(false); }} className={!resultComplete || !result.result || result.resultConfidence < TRUSTED_CONFIDENCE ? "needs-review" : ""}><option value="">Review required</option><option value="Win">Win</option><option value="Loss">Lose</option></ResponsiveSelect><small>{result.result ? `${result.resultConfidence}% · ${result.resultSource}` : "Not confirmed from the MVP badges"}</small></div>
          <div className="sl-scan-choice-field"><span>MVP</span><ResponsiveSelect label="MVP" value={mvpPickIndex} onChange={(event) => { setMvpPickIndex(event.target.value); setVerified(false); setLabVerified(false); }} className={mvpChanged || (mvpPickIndex && !result.mvpTrusted) ? "needs-review" : ""}><option value="">Optional — not detected</option>{reviewRows.map((row) => <option key={row.pickIndex} value={row.pickIndex}>{row.player} · {row.hero}</option>)}</ResponsiveSelect><small>{result.mvp ? `${result.mvpConfidence}% · ${result.mvpSource || "MVP badge"}${result.mvpTrusted ? "" : " · verify"}` : "Leave blank if the MVP badge is unclear"}</small></div>
        </div>
      )}

      {showTeamfightParticipation && reviewedTeamKills !== null && <div className={`local-scan-kill-check${killCheckMismatch ? " mismatch" : ""}`}>{killCheckMismatch ? <TriangleAlert size={15} /> : <CircleCheck size={15} />}<span>Player kills total <strong>{reviewedTeamKills}</strong>{reviewedHeaderTeamKills !== null ? <> · reviewed header <strong>{reviewedHeaderTeamKills}</strong></> : ""}</span></div>}

      {hasScoreboard && (
        <div className="local-scan-header-metrics">
          <label className="local-scan-duration"><span>Opponent kills</span><input type="text" inputMode="numeric" value={opponentTeamKills} onChange={(event) => { setOpponentTeamKills(event.target.value.replace(/\D/g, "").slice(0, 2)); setVerified(false); setLabVerified(false); }} placeholder="Optional" className={!opponentTeamKillsComplete || (reviewedOpponentTeamKills !== null && result.opponentTeamKillsConfidence < TRUSTED_CONFIDENCE) ? "needs-review" : ""} aria-label="Opponent team kills from the score beside Victory" /><small>{result.opponentTeamKills !== null ? `${Math.round(result.opponentTeamKillsConfidence)}% OCR confidence` : "Optional if the score is not readable"} · OCR raw: {displayOcrRaw(result.opponentTeamKillsRaw)}</small></label>
          <label className="local-scan-duration"><span>Duration</span><input type="text" inputMode="numeric" value={duration} onChange={(event) => { setDuration(formatLocalDurationEntry(event.target.value)); setVerified(false); setLabVerified(false); }} placeholder="MMSS (e.g. 2229)" className={!durationComplete || !result.duration || result.durationConfidence < TRUSTED_CONFIDENCE ? "needs-review" : ""} /><small>Type four digits; the colon appears automatically. {result.duration ? `${Math.round(result.durationConfidence)}% OCR confidence` : "Check the duration manually"} · OCR raw: {displayOcrRaw(result.durationRaw)}</small></label>
          <label className="local-scan-duration"><span>Team kills</span><input type="text" inputMode="numeric" value={teamKills} onChange={(event) => { setTeamKills(event.target.value.replace(/\D/g, "").slice(0, 2)); setVerified(false); setLabVerified(false); }} placeholder="0–99" className={!teamKillsComplete || result.teamKills === null || result.teamKillsConfidence < TRUSTED_CONFIDENCE || killCheckMismatch ? "needs-review" : ""} aria-label="Our team kills from the result score" /><small>{result.teamKills !== null ? `${Math.round(result.teamKillsConfidence)}% OCR confidence` : "Read the score on our team's side"} · OCR raw: {displayOcrRaw(result.teamKillsRaw)}</small></label>
        </div>
      )}

      {needsVerification && <div className="local-scan-warning-block"><div><TriangleAlert size={16} /><strong>Some values need attention</strong></div>{reviewWarnings.length > 0 && <ul>{reviewWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}<label><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />I checked the hero mapping and every highlighted value against the screenshot crops.</label></div>}
      <label className="local-scan-quality-optin"><input type="checkbox" checked={labVerified} onChange={(event) => setLabVerified(event.target.checked)} />I compared every value with the screenshot. Add OCR value comparisons to Sessions → Session Data & Patch History on this device; no images or player names are stored.</label>
      {!reviewComplete && <div className="local-scan-alert error"><TriangleAlert size={16} /> <span>Complete every scanned field, IR grade, duration, team kills, and result before applying. MVP stays optional.</span></div>}
      <button type="button" className="local-scan-apply" onClick={applyResults} disabled={!canApply}><CircleCheck size={17} /> {applyLabel}</button>
    </div>
  );
}

export default function LocalResultScanner({ game, gameIndex, heroIcons, onApply, onClose, qualityScope }) {
  const [scoreboardFile, setScoreboardFile] = useState(null);
  const [dataFile, setDataFile] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ message: "", value: 0 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const scanAbortRef = useRef(null);
  const draftError = validateLocalScannerDraft(game.ourPicks || [], heroIcons);

  useEffect(() => () => scanAbortRef.current?.abort(), []);
  const resetResult = () => { setResult(null); setError(""); setProgress({ message: "", value: 0 }); };
  const chooseScoreboard = (file) => { setScoreboardFile(file); resetResult(); };
  const chooseData = (file) => { setDataFile(file); resetResult(); };

  const runScan = async () => {
    scanAbortRef.current?.abort();
    const scanController = new AbortController();
    scanAbortRef.current = scanController;
    setError("");
    setResult(null);
    setScanning(true);
    setProgress({ message: "Preparing screenshots locally…", value: 0 });
    try {
      const output = await scanLocalResultScreens({
        scoreboardFile,
        dataFile,
        picks: game.ourPicks || [],
        heroIcons,
        signal: scanController.signal,
        onProgress: ({ message, progress: value }) => setProgress({ message, value: Math.max(0, Math.min(1, Number(value || 0))) }),
      });
      setResult(output);
      setProgress({ message: "Local scan complete. Review highlighted values and their crops.", value: 1 });
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The local scan could not be completed.");
      if (scanController.signal.aborted) setProgress({ message: "", value: 0 });
    } finally {
      if (scanAbortRef.current === scanController) { scanAbortRef.current = null; setScanning(false); }
    }
  };

  const closeScanner = () => { scanAbortRef.current?.abort(); onClose(); };

  return (
    <section className="local-result-scanner" aria-labelledby={`local-scan-title-${game.id}`}>
      <div className="local-scan-header"><div><span className="local-scan-eyebrow"><ShieldCheck size={13} aria-hidden="true" /> On-device beta</span><h4 id={`local-scan-title-${game.id}`}>Local Result Scanner · Game {gameIndex + 1}</h4><p>The screenshots stay in this browser. Paste, drop, or choose them below.</p></div><button type="button" className="local-scan-close" onClick={closeScanner} aria-label={`Close Local Result Scanner for Game ${gameIndex + 1}`}><X size={17} /></button></div>
      <div className="local-scan-scope"><strong>Use the full 16:9 result frame</strong><span>Top-only YouTube notices are fine. Avoid overlays covering player rows. Screen type and our team's side are checked automatically.</span></div>
      {draftError && <div className="local-scan-alert error"><TriangleAlert size={16} /> <span>{draftError}</span></div>}
      <div className="local-scan-files">
        <ScreenshotInput id={`scoreboard-screenshot-${game.id}`} label="K/D/A + Gold screen" description={'The open screen shows K/D/A and Gold; its bottom button says "Data"'} file={scoreboardFile} onChange={chooseScoreboard} disabled={scanning} />
        <ScreenshotInput id={`data-screenshot-${game.id}`} label="Damage screen" description={'The open screen shows damage bars; its bottom button says "Equipment"'} file={dataFile} onChange={chooseData} disabled={scanning} />
      </div>
      <div className="local-scan-actions"><button type="button" className="local-scan-run" onClick={runScan} disabled={Boolean(draftError) || (!scoreboardFile && !dataFile) || scanning}>{scanning ? <LoaderCircle className="local-scan-spinner" size={17} /> : <ScanLine size={17} />}{scanning ? "Scanning on this device…" : "Scan screenshots locally"}</button>{scanning && <button type="button" className="local-scan-cancel" onClick={() => scanAbortRef.current?.abort()}><X size={16} /> Cancel scan</button>}</div>
      {(scanning || progress.message) && <div className="local-scan-progress" aria-live="polite"><div><span>{progress.message}</span><strong>{Math.round(progress.value * 100)}%</strong></div><span className="local-scan-progress-track"><span style={{ width: `${Math.round(progress.value * 100)}%` }} /></span>{scanning && <small>The scanner runs repeated accuracy passes. A stalled stage stops automatically.</small>}</div>}
      {error && <div className="local-scan-alert error"><TriangleAlert size={16} /> <span>{error}</span></div>}
      {result && <LocalScanResultReview result={result} game={game} heroIcons={heroIcons} onApply={onApply} onApplied={onClose} qualityScope={qualityScope} />}
    </section>
  );
}

function createBatchSlots(games, existing = []) {
  return games.map((game, index) => {
    const previous = existing.find((slot) => slot.gameId === game.id);
    return previous || { gameId: game.id, gameIndex: index, scoreboardFile: null, dataFile: null, scoreboardMatchConfidence: null, dataMatchConfidence: null, result: null, error: "", state: "waiting", applied: false };
  }).map((slot, index) => ({ ...slot, gameIndex: index }));
}

export function BatchLocalResultScanner({ games, heroIcons, onApply, onClose, qualityScope }) {
  const [slots, setSlots] = useState(() => createBatchSlots(games));
  const [matching, setMatching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ message: "", value: 0 });
  const [error, setError] = useState("");
  const scanAbortRef = useRef(null);

  useEffect(() => setSlots((current) => createBatchSlots(games, current)), [games]);
  useEffect(() => () => scanAbortRef.current?.abort(), []);

  const updateSlotFile = (gameId, key, file) => {
    const confidenceKey = key === "scoreboardFile" ? "scoreboardMatchConfidence" : "dataMatchConfidence";
    setSlots((current) => current.map((slot) => slot.gameId === gameId ? { ...slot, [key]: file, [confidenceKey]: null, result: null, error: "", state: "waiting", applied: false } : slot));
    setError("");
  };

  const autoMatchFiles = async (files) => {
    const availableGameIndexesByKind = {
      scoreboard: slots.filter((slot) => !slot.scoreboardFile).map((slot) => slot.gameIndex),
      data: slots.filter((slot) => !slot.dataFile).map((slot) => slot.gameIndex),
    };
    if (!availableGameIndexesByKind.scoreboard.length && !availableGameIndexesByKind.data.length) {
      setError("Every batch slot is already filled. Replace an individual screenshot in its game card if needed.");
      return;
    }
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setMatching(true);
    setError("");
    setProgress({ message: "Reading screenshot types and hero drafts…", value: 0 });
    try {
      const matched = await assignLocalBatchResultScreens({
        files,
        games,
        heroIcons,
        availableGameIndexesByKind,
        signal: controller.signal,
        onProgress: ({ message, progress: value }) => setProgress({ message, value: Math.max(0, Math.min(1, Number(value || 0))) }),
      });
      const assignmentBySlot = new Map(matched.assignments.map((assignment) => [`${assignment.gameIndex}:${assignment.kind}`, assignment]));
      setSlots((current) => current.map((slot) => {
        const scoreboardAssignment = assignmentBySlot.get(`${slot.gameIndex}:scoreboard`);
        const dataAssignment = assignmentBySlot.get(`${slot.gameIndex}:data`);
        if (!scoreboardAssignment && !dataAssignment) return slot;
        return {
          ...slot,
          ...(scoreboardAssignment ? { scoreboardFile: scoreboardAssignment.file, scoreboardMatchConfidence: scoreboardAssignment.confidence } : {}),
          ...(dataAssignment ? { dataFile: dataAssignment.file, dataMatchConfidence: dataAssignment.confidence } : {}),
          result: null,
          error: "",
          state: "waiting",
          applied: false,
        };
      }));
      if (matched.unmatched.length) {
        const details = matched.unmatched.map((item) => `${item.file.name || "Screenshot"}: ${item.reason}`).join(" ");
        setError(`${matched.assignments.length}/${files.length} screenshots were auto-matched. ${details}`);
      }
      setProgress({ message: `Hero-draft matching complete · ${matched.assignments.length}/${files.length} screenshots placed`, value: 1 });
    } catch (matchError) {
      if (!controller.signal.aborted) setError(matchError instanceof Error ? matchError.message : "The screenshots could not be matched to games.");
      else setProgress({ message: "", value: 0 });
    } finally {
      if (scanAbortRef.current === controller) {
        scanAbortRef.current = null;
        setMatching(false);
      }
    }
  };

  const readySlots = slots.filter((slot) => slot.scoreboardFile && slot.dataFile && !validateLocalScannerDraft(games[slot.gameIndex]?.ourPicks || [], heroIcons));
  const busy = matching || scanning;

  const runBatchScan = async () => {
    const queue = slots.filter((slot) => slot.scoreboardFile && slot.dataFile);
    if (!queue.length) { setError("Add both result screenshots to at least one game before starting the batch scan."); return; }
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;
    setScanning(true);
    setError("");
    let completed = 0;
    let succeeded = 0;
    for (const queuedSlot of queue) {
      if (controller.signal.aborted) break;
      const game = games[queuedSlot.gameIndex];
      const draftError = validateLocalScannerDraft(game?.ourPicks || [], heroIcons);
      if (draftError) {
        setSlots((current) => current.map((slot) => slot.gameId === queuedSlot.gameId ? { ...slot, state: "error", error: draftError } : slot));
        completed += 1;
        continue;
      }
      setSlots((current) => current.map((slot) => slot.gameId === queuedSlot.gameId ? { ...slot, state: "scanning", error: "", applied: false } : slot));
      try {
        const result = await scanLocalResultScreens({
          scoreboardFile: queuedSlot.scoreboardFile,
          dataFile: queuedSlot.dataFile,
          picks: game.ourPicks || [],
          heroIcons,
          signal: controller.signal,
          onProgress: ({ message, progress: gameProgress }) => setProgress({ message: `Game ${queuedSlot.gameIndex + 1}/${games.length} · ${message}`, value: (completed + Math.max(0, Math.min(1, Number(gameProgress || 0)))) / queue.length }),
        });
        succeeded += 1;
        setSlots((current) => current.map((slot) => slot.gameId === queuedSlot.gameId ? { ...slot, result, state: "done", error: "" } : slot));
      } catch (scanError) {
        if (controller.signal.aborted) break;
        setSlots((current) => current.map((slot) => slot.gameId === queuedSlot.gameId ? { ...slot, state: "error", error: scanError instanceof Error ? scanError.message : "This game could not be scanned." } : slot));
      }
      completed += 1;
      setProgress({ message: `Completed ${completed}/${queue.length} queued games`, value: completed / queue.length });
    }
    if (!controller.signal.aborted) setProgress({ message: `Batch scan complete · ${succeeded}/${queue.length} games ready for review`, value: 1 });
    if (scanAbortRef.current === controller) scanAbortRef.current = null;
    setScanning(false);
  };

  const closeBatch = () => { scanAbortRef.current?.abort(); onClose(); };

  return (
    <section className="local-result-scanner local-scan-batch" aria-labelledby="local-scan-batch-title">
      <div className="local-scan-header"><div><span className="local-scan-eyebrow"><ShieldCheck size={13} /> Session workflow</span><h4 id="local-scan-batch-title">Batch scan this session</h4><p>Upload screenshots in any order. Their screen type and five heroes are read locally before they are assigned to a game.</p></div><button type="button" className="local-scan-close" onClick={closeBatch} aria-label="Close batch scanner"><X size={17} /></button></div>
      <ScreenshotInput id="batch-result-screenshots" label="Auto-match screenshots by hero draft" description="Choose all K/D/A and Damage screenshots together. File names and picker order are ignored." multiple onFiles={autoMatchFiles} disabled={busy} />
      <div className="local-scan-batch-games">
        {slots.map((slot) => {
          const game = games[slot.gameIndex];
          const draftError = validateLocalScannerDraft(game?.ourPicks || [], heroIcons);
          return (
            <div className={`local-scan-batch-game ${slot.state}`} key={slot.gameId}>
              <div className="local-scan-batch-game-title"><strong>Game {slot.gameIndex + 1}</strong><span>{slot.applied ? "Applied" : slot.state === "done" ? "Ready to review" : slot.state === "scanning" ? "Scanning…" : slot.state === "error" ? "Needs attention" : slot.scoreboardFile && slot.dataFile ? "Queued" : "Add 2 screenshots"}</span></div>
              {draftError && <div className="local-scan-alert error"><TriangleAlert size={15} /> <span>{draftError}</span></div>}
              <div className="local-scan-files"><ScreenshotInput id={`batch-scoreboard-${slot.gameId}`} label="K/D/A + Gold" description={slot.scoreboardMatchConfidence ? `Auto-matched from five heroes · ${slot.scoreboardMatchConfidence}%` : "K/D/A + Gold result tab"} file={slot.scoreboardFile} onChange={(file) => updateSlotFile(slot.gameId, "scoreboardFile", file)} disabled={busy} /><ScreenshotInput id={`batch-data-${slot.gameId}`} label="Damage" description={slot.dataMatchConfidence ? `Auto-matched from five heroes · ${slot.dataMatchConfidence}%` : "Damage result tab"} file={slot.dataFile} onChange={(file) => updateSlotFile(slot.gameId, "dataFile", file)} disabled={busy} /></div>
              {slot.error && <div className="local-scan-alert error"><TriangleAlert size={15} /> <span>{slot.error}</span></div>}
              {slot.result && <LocalScanResultReview result={slot.result} game={game} heroIcons={heroIcons} qualityScope={qualityScope} applied={slot.applied} applyLabel={slot.applied ? `Game ${slot.gameIndex + 1} applied` : `Apply Game ${slot.gameIndex + 1}`} onApply={(payload) => onApply(slot.gameIndex, payload)} onApplied={() => setSlots((current) => current.map((item) => item.gameId === slot.gameId ? { ...item, applied: true } : item))} />}
            </div>
          );
        })}
      </div>
      <div className="local-scan-actions"><button type="button" className="local-scan-run" onClick={runBatchScan} disabled={!readySlots.length || busy}>{busy ? <LoaderCircle className="local-scan-spinner" size={17} /> : <ScanLine size={17} />}{matching ? "Matching screenshots…" : scanning ? "Scanning session…" : `Scan all ready games (${readySlots.length})`}</button>{busy && <button type="button" className="local-scan-cancel" onClick={() => scanAbortRef.current?.abort()}><X size={16} /> {matching ? "Stop matching" : "Stop batch"}</button>}</div>
      {(busy || progress.message) && <div className="local-scan-progress" aria-live="polite"><div><span>{progress.message}</span><strong>{Math.round(progress.value * 100)}%</strong></div><span className="local-scan-progress-track"><span style={{ width: `${Math.round(progress.value * 100)}%` }} /></span>{matching && <small>Nothing is uploaded. Ambiguous hero drafts stay unassigned for manual review.</small>}</div>}
      {error && <div className="local-scan-alert error"><TriangleAlert size={16} /> <span>{error}</span></div>}
    </section>
  );
}
