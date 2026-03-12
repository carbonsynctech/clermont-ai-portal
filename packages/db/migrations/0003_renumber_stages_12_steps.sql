-- Migration: Renumber stages from old 13-step pipeline to new 12-step pipeline
-- Old order: 1-5 unchanged, 6=Style Guide, 7=Edit Style, 8=Fact-Check,
--            9=Final Style Pass (REMOVED), 10=Human Review, 11=Devil's Advocate,
--            12=Integrate Critiques, 13=Export
-- New order: 1-5 unchanged, 6=Fact-Check, 7=Human Review, 8=Devil's Advocate,
--            9=Integrate Critiques, 10=Style Guide, 11=Edit Style, 12=Export

-- Step 1: Delete the Final Style Pass stage rows (old step 9)
DELETE FROM stages WHERE step_number = 9;

-- Step 2: Renumber remaining stages using temporary offset (+100) to avoid collisions
UPDATE stages SET step_number = 106 WHERE step_number = 8;   -- Fact-Check → temp 106
UPDATE stages SET step_number = 107 WHERE step_number = 10;  -- Human Review → temp 107
UPDATE stages SET step_number = 108 WHERE step_number = 11;  -- Devil's Advocate → temp 108
UPDATE stages SET step_number = 109 WHERE step_number = 12;  -- Integrate Critiques → temp 109
UPDATE stages SET step_number = 110 WHERE step_number = 6;   -- Style Guide → temp 110
UPDATE stages SET step_number = 111 WHERE step_number = 7;   -- Edit to Style → temp 111
UPDATE stages SET step_number = 112 WHERE step_number = 13;  -- Export → temp 112

-- Step 3: Set final step numbers from temp values
UPDATE stages SET step_number = 6  WHERE step_number = 106;
UPDATE stages SET step_number = 7  WHERE step_number = 107;
UPDATE stages SET step_number = 8  WHERE step_number = 108;
UPDATE stages SET step_number = 9  WHERE step_number = 109;
UPDATE stages SET step_number = 10 WHERE step_number = 110;
UPDATE stages SET step_number = 11 WHERE step_number = 111;
UPDATE stages SET step_number = 12 WHERE step_number = 112;

-- Step 4: Update step names to match new pipeline definitions
UPDATE stages SET step_name = 'Fact-Check V3'        WHERE step_number = 6;
UPDATE stages SET step_name = 'Human Review V5'       WHERE step_number = 7;
UPDATE stages SET step_name = 'Devil''s Advocate'     WHERE step_number = 8;
UPDATE stages SET step_name = 'Integrate Critiques'   WHERE step_number = 9;
UPDATE stages SET step_name = 'Load Style Guide'      WHERE step_number = 10;
UPDATE stages SET step_name = 'Edit to Style V2'      WHERE step_number = 11;
UPDATE stages SET step_name = 'Export HTML→PDF'       WHERE step_number = 12;

-- Step 5: Update currentStage on projects table to match new numbering
-- Map old currentStage values to new ones (use temp offset to avoid collisions)
UPDATE projects SET current_stage = 106 WHERE current_stage = 8;   -- Fact-Check
UPDATE projects SET current_stage = 107 WHERE current_stage = 10;  -- Human Review
UPDATE projects SET current_stage = 108 WHERE current_stage = 11;  -- Devil's Advocate
UPDATE projects SET current_stage = 109 WHERE current_stage = 12;  -- Integrate Critiques
UPDATE projects SET current_stage = 110 WHERE current_stage = 6;   -- Style Guide
UPDATE projects SET current_stage = 111 WHERE current_stage = 7;   -- Edit to Style
UPDATE projects SET current_stage = 112 WHERE current_stage = 13;  -- Export

-- Projects at old step 9 (Final Style Pass) move to step 7 (Human Review, next logical step)
UPDATE projects SET current_stage = 107 WHERE current_stage = 9;

-- Set final values from temp
UPDATE projects SET current_stage = 6  WHERE current_stage = 106;
UPDATE projects SET current_stage = 7  WHERE current_stage = 107;
UPDATE projects SET current_stage = 8  WHERE current_stage = 108;
UPDATE projects SET current_stage = 9  WHERE current_stage = 109;
UPDATE projects SET current_stage = 10 WHERE current_stage = 110;
UPDATE projects SET current_stage = 11 WHERE current_stage = 111;
UPDATE projects SET current_stage = 12 WHERE current_stage = 112;
