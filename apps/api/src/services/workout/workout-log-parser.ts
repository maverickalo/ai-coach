import type {
  CurrentWorkout,
  ParsedExerciseLog,
  ParsedPain,
  ParsedWorkoutLog
} from "../../types/domain.js";

export interface AiWorkoutLogParser {
  parseWorkoutLog(
    message: string,
    currentWorkout: CurrentWorkout | null
  ): Promise<ParsedWorkoutLog>;
}

const exerciseAliases: Record<string, string> = {
  squat: "Back Squat",
  squats: "Back Squat",
  rdl: "Romanian Deadlift",
  rdls: "Romanian Deadlift",
  bench: "Bench Press",
  "step ups": "Box Step-Up",
  "step-ups": "Box Step-Up",
  stepups: "Box Step-Up",
  lunges: "Reverse Lunge",
  lunge: "Reverse Lunge",
  pullups: "Pull-Up",
  "pull ups": "Pull-Up",
  "pull-ups": "Pull-Up"
};

function canonicalExerciseName(
  rawName: string,
  currentWorkout: CurrentWorkout | null
): string {
  const normalized = rawName.trim().toLowerCase();
  const alias = exerciseAliases[normalized];
  if (alias) {
    return alias;
  }

  const prescribed = currentWorkout?.exercises.find((item) => {
    const name = item.exercise.name.toLowerCase();
    return name.includes(normalized) || normalized.includes(name);
  });

  return prescribed?.exercise.name ?? rawName.trim();
}

function detectPain(message: string): ParsedPain[] {
  const bodyAreas = [
    "wrist",
    "knee",
    "back",
    "shoulder",
    "hip",
    "ankle",
    "elbow",
    "neck"
  ];

  const lowerMessage = message.toLowerCase();
  return bodyAreas
    .filter(
      (area) =>
        lowerMessage.includes(area) &&
        /(hurt|pain|sore|ache|tweak|injur)/i.test(lowerMessage)
    )
    .map((bodyArea) => {
      const severityMatch = lowerMessage.match(
        new RegExp(`${bodyArea}[^\\d]{0,20}(10|[1-9])(?:\\s*\\/\\s*10)?`)
      );
      return {
        bodyArea,
        description: message.trim(),
        severity: severityMatch?.[1] ? Number(severityMatch[1]) : null
      };
    });
}

export function parseWorkoutLogFallback(
  message: string,
  currentWorkout: CurrentWorkout | null
): ParsedWorkoutLog {
  const exercises: ParsedExerciseLog[] = [];
  const segments = message
    .split(/[,;\n]|\.(?=\s|$)/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    const skippedMatch = segment.match(
      /(?:skipped?|done except|except)\s+(?:the\s+)?(.+)$/i
    );
    if (skippedMatch?.[1]) {
      const [rawExercise, ...reasonParts] = skippedMatch[1].split(/\s+because\s+/i);
      if (!rawExercise) {
        continue;
      }
      exercises.push({
        exerciseName: canonicalExerciseName(rawExercise, currentWorkout),
        status: "skipped",
        sets: null,
        reps: null,
        weight: null,
        rpe: null,
        difficulty: null,
        skippedReason:
          reasonParts.length > 0 ? reasonParts.join(" because ").trim() : null,
        substituteExerciseName: null,
        notes: segment
      });
      continue;
    }

    const performanceMatch = segment.match(
      /^([a-z][a-z -]*?)\s+(\d+(?:\.\d+)?)(.*)$/i
    );
    if (!performanceMatch?.[1] || !performanceMatch[2]) {
      continue;
    }

    const setsRepsMatch = performanceMatch[3]?.match(
      /(?:^|\s)(\d+)\s*[xX]\s*(\d+)/
    );
    const lowerSegment = segment.toLowerCase();
    const difficulty = lowerSegment.includes("easy")
      ? "easy"
      : lowerSegment.includes("hard")
        ? "hard"
        : null;
    const rpeMatch = segment.match(/rpe\s*(10|[1-9](?:\.\d)?)/i);
    const partial = /missed|failed|partial/i.test(segment);

    exercises.push({
      exerciseName: canonicalExerciseName(performanceMatch[1], currentWorkout),
      status: partial ? "partial" : "completed",
      weight: Number(performanceMatch[2]),
      sets: setsRepsMatch?.[1] ? Number(setsRepsMatch[1]) : null,
      reps: setsRepsMatch?.[2] ?? null,
      rpe: rpeMatch?.[1] ? Number(rpeMatch[1]) : null,
      difficulty,
      skippedReason: null,
      substituteExerciseName: null,
      notes: segment
    });
  }

  const lowerMessage = message.toLowerCase();
  const workoutCompletion =
    /done except|skipped|missed|partial/i.test(lowerMessage)
      ? "partial"
      : /\bdone\b|completed|finished/i.test(lowerMessage)
        ? "complete"
        : "unknown";

  return {
    exercises,
    pain: detectPain(message),
    notes: exercises.length === 0 ? [message.trim()] : [],
    workoutCompletion
  };
}

export async function parseWorkoutLog(
  message: string,
  currentWorkout: CurrentWorkout | null,
  aiParser?: AiWorkoutLogParser
): Promise<ParsedWorkoutLog> {
  if (aiParser) {
    try {
      return await aiParser.parseWorkoutLog(message, currentWorkout);
    } catch {
      return parseWorkoutLogFallback(message, currentWorkout);
    }
  }

  return parseWorkoutLogFallback(message, currentWorkout);
}

export function findMissingExercises(
  currentWorkout: CurrentWorkout | null,
  parsedLog: ParsedWorkoutLog
): string[] {
  if (!currentWorkout) {
    return [];
  }

  const loggedNames = new Set(
    parsedLog.exercises.map((entry) => entry.exerciseName.toLowerCase())
  );

  return currentWorkout.exercises
    .filter(
      (item) =>
        item.notes !== "Warm-up" &&
        !loggedNames.has(item.exercise.name.toLowerCase())
    )
    .map((item) => item.exercise.name);
}
