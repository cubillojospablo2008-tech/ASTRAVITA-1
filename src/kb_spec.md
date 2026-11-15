# ASTRAVITA knowledge base — shared spec for research agents

ASTRAVITA is a single-page web app that helps PREVENT psychological/mental crises (anxiety, depression, acute stress, cognitive fatigue, sleep disruption, isolation) in astronauts living for long periods in small isolated spaces. It analyses the face via webcam (expressions, micro-expressions, rPPG heart rate, HRV, respiration, blinks, PERCLOS, yawns, facial tension, head stability) plus an optional short questionnaire, and compares them with a PRELOADED knowledge base (no AI/API) to give an ORIENTATION (never a diagnosis): ranked findings, probable causes, countermeasures, escalation criteria, and sources.

## Hard rules
- ALL text in English. Tone calm and supportive. Use "may indicate", "pattern consistent with", "worth discussing with your flight surgeon". Never "you have" / "you are diagnosed with".
- NEVER invent numbers. Every threshold/statistic must come from a source you actually opened (title + URL + year), or from the local files in /home/claude/work/medtxt/ (cite as {"title": "<file name>", "url": "local:datos medicos/<file>.pdf", "year": <year if known>}). If no reliable number exists, use a baseline-relative rule and say "no validated absolute threshold" in `notes`.
- Prefer official sources: NASA Human Research Program (Risk of Adverse Cognitive or Behavioral Conditions and Psychiatric Disorders; Risk of Performance Decrements due to Sleep Loss/Circadian Desynchronization; Risk of Performance and Behavioral Health Decrements due to Inadequate Cooperation, Coordination, Communication; HRP evidence reports), NASA-STD-3001, WHO, NIH/NIMH, MedlinePlus, CDC, validated scales (PHQ-2/PHQ-9, GAD-2/GAD-7, ISI, Karolinska Sleepiness Scale, UCLA loneliness 3-item), ICE studies (Mars-500, HI-SEAS, Antarctic overwintering, third-quarter phenomenon), HRV norms (Shaffer & Ginsberg 2017, Nunan 2010), PERCLOS (Wierwille/Dinges FHWA 1998).
- Each condition must state which camera indicators CANNOT support it on their own (`camera_limits`).
- Output must be VALID JSON (no comments, no trailing commas). Write it with the Write tool to the path you are given.

## Indicator vocabulary (the ONLY indicator names rules may use)
Session camera features (session mean unless noted):
- hr_bpm, rmssd_ms, rr_rpm, blink_rate_min, perclos_pct (0-100), yawn_per_10min, facial_tension (0-100), head_stability_pct (0-100, higher=steadier), microexpr_min,
- emotion_neutral_pct, emotion_happy_pct, emotion_sad_pct, emotion_angry_pct, emotion_fear_pct, emotion_surprise_pct, emotion_disgust_pct (each 0-100, sum 100),
- affect_variability (0-100, low = flat/reduced expressivity),
- stress_index, fatigue_level, wellbeing_index (0-100 composite indices),
- local_hour (0-23, hour the session ran),
- signal_quality (0-100).
Questionnaire items (answers given by the user):
- q_mood_low, q_anhedonia (PHQ-2 items, 0-3: not at all / several days / more than half the days / nearly every day)
- q_nervous, q_worry (GAD-2 items, 0-3 same scale)
- q_sleep_quality (0-3, 0=very good ... 3=very poor), q_sleep_hours (number), q_sleepiness (KSS 1-9)
- q_lonely (0-3), q_workload (0-3 overwhelming), q_irritability (0-3), q_conflict (0-3)
- q_headache (0-3), q_congestion (0-3, facial puffiness / nasal stuffiness), q_low_energy (0-3), q_cold_intolerance (0-3), q_appetite_change (0-3), q_concentration (0-3 difficulty), q_med_change (0/1: new or changed medication, sleep aid or stimulant in last 72 h), q_homesick (0-3), q_boredom (0-3), q_mission_phase (1-4 quarter of the mission)
- q_safety (0/1 thoughts of being better off dead or of hurting yourself) — handled by the app's safety protocol; DO NOT use in condition rules.

Rule object:
{"indicator": "<name>", "op": ">"|">="|"<"|"<=", "threshold": <number>, "ref": "baseline_pct" | "absolute", "weight": <1-30 points>, "note": "<short why + source key>"}
- ref "baseline_pct": threshold is % change vs the person's own baseline (e.g. {"indicator":"hr_bpm","op":">","threshold":15,"ref":"baseline_pct"} = HR more than 15 % above personal baseline). Use this when no validated absolute cut-off exists.
- ref "absolute": threshold in the indicator's own units.
- Sum of a condition's rule weights should be ~100 (camera + questionnaire). Questionnaire rules typically carry 30-60 % of weight for psychological conditions because the camera alone cannot support them.

## Output object
{
 "conditions": [ {
   "id": "snake_case", "name": "Pattern consistent with ...", "category": "psychological|sleep_circadian|cognitive|social|physiological|environmental|nutritional|endocrine|pharmacological",
   "summary": "1-2 sentences",
   "indicator_rules": [ ...rule objects... ],
   "questionnaire_triggers": ["q_mood_low>=2", ...],   // human-readable mirror of the questionnaire rules
   "probable_causes": ["...", "..."],
   "isolation_relevance": "why it matters in long-duration isolated/confined missions",
   "orientative_interpretation": "calm 2-3 sentence text using 'may indicate' language",
   "countermeasure_ids": ["cm_..."],
   "escalation_criteria": "when to involve the flight surgeon / behavioral health team",
   "red_flags": ["..."],
   "camera_limits": "which camera indicators cannot support this alone",
   "sources": [ {"title":"...","url":"...","year":2023} ]
 } ],
 "countermeasures": [ {
   "id": "cm_...", "title": "...", "category": "sleep|light|breathing|exercise|nutrition|social|cognitive|schedule|medical|environment",
   "steps": ["...", "..."], "duration": "e.g. 5 min", "evidence_level": "high|moderate|low|expert opinion",
   "sources": [ {...} ]
 } ],
 "reference_ranges": { "<indicator>": {"low": n, "high": n, "unit": "...", "population": "...", "notes": "...", "sources": [ ... ] } }   // only agent B fills this
 "questionnaire": {...}  // only agent A fills this
}

## Shared countermeasure ID list (both agents may REFERENCE any id; each agent DEFINES only its own)
Agent A defines (psych / sleep / social / cognitive / breathing / light / schedule):
cm_paced_breathing_6, cm_box_breathing, cm_physiological_sigh, cm_pmr, cm_body_scan, cm_cognitive_reframing, cm_worry_window, cm_grounding_54321, cm_behavioral_activation, cm_pleasant_activity_schedule, cm_gratitude_journal, cm_expressive_writing, cm_mindfulness_10min, cm_task_chunking, cm_microbreaks, cm_cognitive_load_review, cm_family_conference, cm_crew_social_meal, cm_private_space_time, cm_conflict_debrief, cm_peer_support_checkin, cm_bhp_consult, cm_sleep_hygiene, cm_sleep_schedule_anchor, cm_strategic_nap, cm_caffeine_timing, cm_wind_down_routine, cm_cbti_stimulus_control, cm_bright_light_morning, cm_evening_light_dimming, cm_circadian_lighting_shift, cm_workload_rebalance, cm_autonomy_scheduling, cm_novelty_variety, cm_leisure_hobby, cm_nature_vr_exposure, cm_mission_milestones
Agent B defines (exercise / nutrition / medical / environment):
cm_aerobic_session, cm_resistance_session, cm_stretching_break, cm_neck_shoulder_release, cm_jaw_relaxation, cm_hydration_check, cm_iron_diet_review, cm_b12_review, cm_vitamin_d_review, cm_regular_meals, cm_stimulant_review, cm_flight_surgeon_review, cm_lab_panel_request, cm_medication_review, cm_vision_check, cm_bp_check, cm_co2_ventilation_check, cm_head_elevation_rest, cm_thigh_cuffs, cm_noise_reduction, cm_thermal_comfort, cm_screen_eye_rest
