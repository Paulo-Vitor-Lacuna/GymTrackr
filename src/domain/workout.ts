export type WorkoutInput = {
  exercise: string;
  loadKg: string;
  reps: string;
};

export type WorkoutEntry = {
  id: string;
  sessionId?: string;
  sessionStartedAt?: string;
  planId?: string;
  planName?: string;
  exerciseId?: string;
  exercise: string;
  loadKg: number;
  reps: number;
  createdAt: string;
};

export type PlanExercise = {
  id: string;
  name: string;
};

export type TrainingPlan = {
  id: string;
  name: string;
  exercises: PlanExercise[];
  createdAt: string;
  updatedAt: string;
};

export type TrainingPlanInput = {
  name: string;
  exercise: string;
};

export type WorkoutSession = {
  id: string;
  planName: string;
  startedAt: string;
  entries: WorkoutEntry[];
  volume: number;
};

export type WorkoutInputErrors = Partial<Record<keyof WorkoutInput, string>>;
export type TrainingPlanInputErrors = Partial<Record<keyof TrainingPlanInput, string>>;

const idSuffix = () => Math.random().toString(36).slice(2, 8);

export function normalizeExerciseName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizePlanName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function parseLoadKg(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseReps(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function validateWorkoutInput(input: WorkoutInput): WorkoutInputErrors {
  const errors: WorkoutInputErrors = {};
  const exercise = normalizeExerciseName(input.exercise);
  const loadKg = parseLoadKg(input.loadKg);
  const reps = parseReps(input.reps);

  if (!exercise) {
    errors.exercise = "Informe o exercício ou aparelho.";
  }

  if (loadKg === null || loadKg < 0) {
    errors.loadKg = "Use uma carga válida em kg.";
  }

  if (reps === null || reps < 1) {
    errors.reps = "Use um número inteiro de repetições.";
  }

  return errors;
}

export function validateTrainingPlanName(name: string): TrainingPlanInputErrors {
  const errors: TrainingPlanInputErrors = {};

  if (!normalizePlanName(name)) {
    errors.name = "Informe o nome do treino.";
  }

  return errors;
}

export function validatePlanExerciseName(exercise: string): TrainingPlanInputErrors {
  const errors: TrainingPlanInputErrors = {};

  if (!normalizeExerciseName(exercise)) {
    errors.exercise = "Informe um exercício.";
  }

  return errors;
}

export function createWorkoutEntry(
  input: WorkoutInput,
  now = new Date(),
  suffix = idSuffix(),
  plan?: Pick<TrainingPlan, "id" | "name">,
  exerciseId?: string,
  session?: Pick<WorkoutSession, "id" | "startedAt">
): WorkoutEntry {
  const errors = validateWorkoutInput(input);

  if (Object.keys(errors).length > 0) {
    throw new Error("Invalid workout input");
  }

  return {
    id: `${now.getTime()}-${suffix}`,
    ...(session ? { sessionId: session.id, sessionStartedAt: session.startedAt } : {}),
    ...(plan ? { planId: plan.id, planName: plan.name } : {}),
    ...(exerciseId ? { exerciseId } : {}),
    exercise: normalizeExerciseName(input.exercise),
    loadKg: parseLoadKg(input.loadKg) ?? 0,
    reps: parseReps(input.reps) ?? 0,
    createdAt: now.toISOString()
  };
}

export function createTrainingPlan(
  name: string,
  now = new Date(),
  suffix = idSuffix()
): TrainingPlan {
  const errors = validateTrainingPlanName(name);

  if (Object.keys(errors).length > 0) {
    throw new Error("Invalid training plan name");
  }

  return {
    id: `${now.getTime()}-${suffix}`,
    name: normalizePlanName(name),
    exercises: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

export function addExerciseToPlan(
  plan: TrainingPlan,
  exercise: string,
  now = new Date(),
  suffix = idSuffix()
): TrainingPlan {
  const errors = validatePlanExerciseName(exercise);

  if (Object.keys(errors).length > 0) {
    throw new Error("Invalid plan exercise");
  }

  return {
    ...plan,
    exercises: [
      ...plan.exercises,
      {
        id: `${now.getTime()}-${suffix}`,
        name: normalizeExerciseName(exercise)
      }
    ],
    updatedAt: now.toISOString()
  };
}

export function calculateVolume(entries: WorkoutEntry[]) {
  return entries.reduce((total, entry) => total + entry.loadKg * entry.reps, 0);
}

export function groupWorkoutEntriesBySession(entries: WorkoutEntry[]): WorkoutSession[] {
  const sessions = new Map<string, WorkoutSession>();

  entries.forEach((entry) => {
    const dateKey = entry.createdAt.slice(0, 10);
    const sessionId = `${entry.planId ?? "avulso"}-${dateKey}`;
    const startedAt = entry.sessionStartedAt ?? entry.createdAt;
    const existing = sessions.get(sessionId);

    if (existing) {
      existing.entries.push(entry);
      existing.volume += entry.loadKg * entry.reps;

      if (new Date(startedAt).getTime() < new Date(existing.startedAt).getTime()) {
        existing.startedAt = startedAt;
      }

      return;
    }

    sessions.set(sessionId, {
      id: sessionId,
      planName: entry.planName ?? "Treino avulso",
      startedAt,
      entries: [entry],
      volume: entry.loadKg * entry.reps
    });
  });

  return Array.from(sessions.values()).sort(
    (left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()
  );
}
