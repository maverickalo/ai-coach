export interface ExerciseResource {
  demoUrl: string;
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

export function exerciseResource(exerciseName: string): ExerciseResource {
  return {
    demoUrl: exerciseDemoUrl(exerciseName),
    gifSearchUrl: gifSearchUrl(exerciseName)
  };
}
