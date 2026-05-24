import AsyncStorage from "@react-native-async-storage/async-storage";

import { TrainingPlan, WorkoutEntry } from "../domain/workout";

const WORKOUTS_KEY = "@gymtrackr/workouts";
const TRAINING_PLANS_KEY = "@gymtrackr/training-plans";

export async function loadWorkouts(): Promise<WorkoutEntry[]> {
  const raw = await AsyncStorage.getItem(WORKOUTS_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveWorkouts(entries: WorkoutEntry[]) {
  await AsyncStorage.setItem(WORKOUTS_KEY, JSON.stringify(entries));
}

export async function loadTrainingPlans(): Promise<TrainingPlan[]> {
  const raw = await AsyncStorage.getItem(TRAINING_PLANS_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveTrainingPlans(plans: TrainingPlan[]) {
  await AsyncStorage.setItem(TRAINING_PLANS_KEY, JSON.stringify(plans));
}
