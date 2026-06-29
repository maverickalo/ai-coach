export interface ExerciseResource {
  demoUrl: string;
  gifUrl: string;
  gifSearchUrl: string;
  purpose: string;
  setup: string;
  cues: string[];
  commonMistakes: string[];
}

const curatedDemoUrls: Record<string, string> = {
  "Back Squat": "https://www.youtube.com/results?search_query=back+squat+proper+form+demo",
  "Romanian Deadlift": "https://www.youtube.com/results?search_query=romanian+deadlift+proper+form+demo",
  "Reverse Lunge": "https://www.youtube.com/results?search_query=reverse+lunge+proper+form+demo",
  "Box Step-Up": "https://www.youtube.com/results?search_query=box+step+up+proper+form+demo",
  "Bench Press": "https://www.youtube.com/results?search_query=bench+press+proper+form+demo",
  "Deadlift": "https://www.youtube.com/results?search_query=deadlift+proper+form+demo",
  "Pull-Up": "https://www.youtube.com/results?search_query=pull+up+proper+form+demo",
  "Wall Ball": "https://www.youtube.com/results?search_query=hyrox+wall+ball+proper+form+demo",
  "Slam Ball": "https://www.youtube.com/results?search_query=slam+ball+proper+form+demo",
  "Farmer Carry": "https://www.youtube.com/results?search_query=farmer+carry+proper+form+demo",
  "Assault Bike": "https://www.youtube.com/results?search_query=assault+bike+workout+technique",
  "Cable Row": "https://www.youtube.com/results?search_query=cable+row+proper+form+demo",
  "Lat Pulldown": "https://www.youtube.com/results?search_query=lat+pulldown+proper+form+demo"
};

const curatedGifUrls: Record<string, string> = {
  "Back Squat": "https://tenor.com/search/back-squat-exercise-gifs",
  "Romanian Deadlift": "https://tenor.com/search/romanian-deadlift-exercise-gifs",
  "Reverse Lunge": "https://tenor.com/search/reverse-lunge-exercise-gifs",
  "Box Step-Up": "https://tenor.com/search/box-step-up-exercise-gifs",
  "Bench Press": "https://tenor.com/search/bench-press-exercise-gifs",
  "Incline Dumbbell Press": "https://tenor.com/search/incline-dumbbell-press-exercise-gifs",
  "Overhead Press": "https://tenor.com/search/overhead-press-exercise-gifs",
  "Cable Fly": "https://tenor.com/search/cable-fly-exercise-gifs",
  "Lateral Raise": "https://tenor.com/search/lateral-raise-exercise-gifs",
  "Triceps Pushdown": "https://tenor.com/search/triceps-pushdown-exercise-gifs",
  "Pull-Up": "https://tenor.com/search/pull-up-exercise-gifs",
  "Deadlift": "https://tenor.com/search/deadlift-exercise-gifs",
  "Dumbbell Row": "https://tenor.com/search/dumbbell-row-exercise-gifs",
  "Lat Pulldown": "https://tenor.com/search/lat-pulldown-exercise-gifs",
  "Cable Row": "https://tenor.com/search/cable-row-exercise-gifs",
  "Face Pull": "https://tenor.com/search/face-pull-exercise-gifs",
  "Hammer Curl": "https://tenor.com/search/hammer-curl-exercise-gifs",
  "Front Squat": "https://tenor.com/search/front-squat-exercise-gifs",
  "Walking Lunge": "https://tenor.com/search/walking-lunge-exercise-gifs",
  "Single-Leg RDL": "https://tenor.com/search/single-leg-rdl-exercise-gifs",
  "Goblet Squat": "https://tenor.com/search/goblet-squat-exercise-gifs",
  "Box Jump": "https://tenor.com/search/box-jump-exercise-gifs",
  "Wall Ball": "https://tenor.com/search/wall-ball-exercise-gifs",
  "Slam Ball": "https://tenor.com/search/slam-ball-exercise-gifs",
  "Farmer Carry": "https://tenor.com/search/farmer-carry-exercise-gifs",
  "Ab Roller": "https://tenor.com/search/ab-wheel-rollout-exercise-gifs",
  "Cable Crunch": "https://tenor.com/search/cable-crunch-exercise-gifs",
  "Pallof Press": "https://tenor.com/search/pallof-press-exercise-gifs",
  "Hanging Leg Raise": "https://tenor.com/search/hanging-leg-raise-exercise-gifs",
  "Assault Bike": "https://tenor.com/search/assault-bike-workout-gifs"
};

const defaultGuide = {
  purpose: "Build the target muscles for today's strength plan with clean reps and controlled effort.",
  setup: "Set up the movement so you feel stable before the first rep.",
  cues: ["Control the lowering phase", "Keep the working joints stacked", "Stop 1-3 reps before form breaks"],
  commonMistakes: ["Rushing reps", "Letting fatigue change the movement", "Adding load before the pattern is solid"]
};

const exerciseGuides: Record<
  string,
  {
    purpose: string;
    setup: string;
    cues: string[];
    commonMistakes: string[];
  }
> = {
  "Bench Press": {
    purpose: "Main upper-body strength lift for chest, shoulders, and triceps.",
    setup: "Eyes under the bar, feet planted, shoulder blades pulled back and down, slight arch, hands even on the bar.",
    cues: ["Lower to lower chest with control", "Keep wrists stacked over elbows", "Drive feet into the floor as you press"],
    commonMistakes: ["Bouncing the bar", "Letting elbows flare hard", "Losing upper-back tightness"]
  },
  "Incline Dumbbell Press": {
    purpose: "Build upper chest and pressing volume with a shoulder-friendly dumbbell path.",
    setup: "Bench at a moderate incline, dumbbells at chest level, shoulder blades set before the first rep.",
    cues: ["Press up and slightly in", "Lower until elbows are just below shoulders", "Keep ribs down"],
    commonMistakes: ["Turning it into a shoulder press", "Crashing dumbbells together", "Overextending the low back"]
  },
  "Overhead Press": {
    purpose: "Train strict shoulder and triceps strength with full-body bracing.",
    setup: "Bar at upper chest, hands just outside shoulders, glutes tight, ribs down.",
    cues: ["Press straight up", "Move your head through after the bar clears", "Finish with biceps near ears"],
    commonMistakes: ["Leaning back", "Pressing around the face", "Soft core at lockout"]
  },
  "Cable Fly": {
    purpose: "Add chest volume without heavy joint loading.",
    setup: "Cables set around chest height, one foot slightly forward, soft bend in the elbows.",
    cues: ["Hug the arms together", "Pause when hands meet", "Control the stretch"],
    commonMistakes: ["Pressing instead of flying", "Shrugging shoulders", "Going too heavy"]
  },
  "Lateral Raise": {
    purpose: "Build side delts for shoulder volume and durability.",
    setup: "Light dumbbells, soft knees, slight forward lean, arms relaxed at sides.",
    cues: ["Lead with elbows", "Raise to shoulder height", "Keep traps quiet"],
    commonMistakes: ["Swinging", "Shrugging", "Using weight that forces momentum"]
  },
  "Triceps Pushdown": {
    purpose: "Finish triceps volume after pressing.",
    setup: "Cable high, elbows pinned near ribs, chest tall.",
    cues: ["Extend fully", "Pause at the bottom", "Let forearms move while upper arms stay still"],
    commonMistakes: ["Rocking the torso", "Elbows drifting forward", "Short reps"]
  },
  "Back Squat": {
    purpose: "Primary lower-body strength lift for quads, glutes, and trunk bracing.",
    setup: "Bar tight on upper back, feet around shoulder width, brace before each descent.",
    cues: ["Sit between your hips", "Keep bar over mid-foot", "Drive up through the whole foot"],
    commonMistakes: ["Knees collapsing in", "Losing brace at the bottom", "Good-morning the weight up"]
  },
  "Romanian Deadlift": {
    purpose: "Build hamstrings, glutes, and hinge strength.",
    setup: "Bar at hips, soft knees, lats tight, weight balanced over mid-foot.",
    cues: ["Push hips back", "Keep bar close", "Stop when hamstrings limit the range"],
    commonMistakes: ["Squatting the rep", "Rounding the back", "Reaching the bar away from legs"]
  },
  "Reverse Lunge": {
    purpose: "Single-leg strength with less knee stress than forward lunges.",
    setup: "Stand tall with load controlled, step back far enough to make both knees bend cleanly.",
    cues: ["Drop straight down", "Drive through front foot", "Keep front knee tracking over toes"],
    commonMistakes: ["Pushing off the back foot too much", "Taking a tiny step", "Losing balance between reps"]
  },
  "Box Step-Up": {
    purpose: "Build single-leg strength and HYROX-friendly leg endurance.",
    setup: "Use a box height where the working thigh starts near parallel, whole foot on the box.",
    cues: ["Drive through the top foot", "Stand tall at the top", "Control the step down"],
    commonMistakes: ["Jumping off the floor leg", "Letting knee cave in", "Dropping fast on the way down"]
  },
  "Deadlift": {
    purpose: "Heavy hinge strength for posterior chain and grip.",
    setup: "Bar over mid-foot, shins close, lats tight, brace hard before pulling.",
    cues: ["Push the floor away", "Keep bar close", "Stand tall without leaning back"],
    commonMistakes: ["Yanking from a loose setup", "Bar drifting forward", "Rounding under load"]
  },
  "Pull-Up": {
    purpose: "Vertical pulling strength for lats, upper back, and grip.",
    setup: "Full grip on bar, ribs down, start from a controlled hang.",
    cues: ["Pull elbows toward ribs", "Chest moves toward bar", "Lower under control"],
    commonMistakes: ["Half reps", "Kicking every rep", "Shrugging into the neck"]
  },
  "Wall Ball": {
    purpose: "HYROX conditioning with legs, trunk, and shoulders.",
    setup: "Ball at chest, feet squat-width, target in front of you.",
    cues: ["Squat first", "Drive through legs", "Catch smoothly into the next rep"],
    commonMistakes: ["Throwing with only arms", "Rushing depth", "Letting catches pull you forward"]
  },
  "Slam Ball": {
    purpose: "Power conditioning without much eccentric loading.",
    setup: "Ball between feet, hips loaded, arms long overhead before each slam.",
    cues: ["Reach tall", "Snap hips and ribs down", "Pick up with a hinge"],
    commonMistakes: ["Squatting every pickup", "Slamming with only arms", "Losing brace when tired"]
  },
  "Farmer Carry": {
    purpose: "Grip, trunk, and loaded walking strength for HYROX durability.",
    setup: "Heavy implements at sides, shoulders packed, tall posture before walking.",
    cues: ["Walk tall", "Short controlled steps", "Do not let weights pull you sideways"],
    commonMistakes: ["Leaning back", "Rushing turns", "Letting shoulders dump forward"]
  }
};

function youtubeSearchUrl(exerciseName: string): string {
  const query = new URLSearchParams({
    search_query: `${exerciseName} exercise demo proper form`
  });
  return `https://www.youtube.com/results?${query.toString()}`;
}

function gifSearchUrl(exerciseName: string): string {
  const query = new URLSearchParams({
    q: `${exerciseName} exercise form gif`
  });
  return `https://www.google.com/search?tbm=isch&${query.toString()}`;
}

export function exerciseDemoUrl(exerciseName: string): string {
  return curatedDemoUrls[exerciseName] ?? youtubeSearchUrl(exerciseName);
}

export function exerciseGifUrl(exerciseName: string): string {
  return curatedGifUrls[exerciseName] ?? gifSearchUrl(exerciseName);
}

export function exerciseResource(exerciseName: string): ExerciseResource {
  const guide = exerciseGuides[exerciseName] ?? defaultGuide;
  return {
    demoUrl: exerciseDemoUrl(exerciseName),
    gifUrl: exerciseGifUrl(exerciseName),
    gifSearchUrl: gifSearchUrl(exerciseName),
    ...guide
  };
}
