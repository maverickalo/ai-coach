export interface ExerciseResource {
  demoUrl: string;
  gifUrl: string;
  gifSearchUrl: string;
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
  return {
    demoUrl: exerciseDemoUrl(exerciseName),
    gifUrl: exerciseGifUrl(exerciseName),
    gifSearchUrl: gifSearchUrl(exerciseName)
  };
}
