import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calculateVolume,
  addExerciseToPlan,
  createTrainingPlan,
  createWorkoutEntry,
  groupWorkoutEntriesBySession,
  normalizeExerciseName,
  validateTrainingPlanName,
  validateWorkoutInput
} from "../src/domain/workout";

describe("workout domain", () => {
  it("normalizes exercise names", () => {
    assert.equal(normalizeExerciseName("  supino   reto  "), "supino reto");
  });

  it("validates required workout fields", () => {
    assert.deepEqual(validateWorkoutInput({ exercise: "", loadKg: "-1", reps: "0" }), {
      exercise: "Informe o exercício ou aparelho.",
      loadKg: "Use uma carga válida em kg.",
      reps: "Use um número inteiro de repetições."
    });
  });

  it("creates a workout entry with numeric load and reps", () => {
    const entry = createWorkoutEntry(
      { exercise: "Cadeira extensora", loadKg: "32,5", reps: "12" },
      new Date("2026-05-20T12:00:00.000Z"),
      "fixed"
    );

    assert.deepEqual(entry, {
      id: "1779278400000-fixed",
      exercise: "Cadeira extensora",
      loadKg: 32.5,
      reps: 12,
      createdAt: "2026-05-20T12:00:00.000Z"
    });
  });

  it("creates a named training plan", () => {
    const plan = createTrainingPlan("  Treino   A1  ", new Date("2026-05-20T12:00:00.000Z"), "a1");

    assert.equal(plan.name, "Treino A1");
    assert.equal(plan.exercises.length, 0);
    assert.deepEqual(validateTrainingPlanName(""), { name: "Informe o nome do treino." });
  });

  it("adds exercises to a training plan", () => {
    const plan = createTrainingPlan("Treino A1", new Date("2026-05-20T12:00:00.000Z"), "a1");
    const nextPlan = addExerciseToPlan(
      plan,
      "  Puxada   alta  ",
      new Date("2026-05-20T12:01:00.000Z"),
      "ex1"
    );

    assert.deepEqual(nextPlan.exercises, [
      {
        id: "1779278460000-ex1",
        name: "Puxada alta"
      }
    ]);
  });

  it("links a workout entry to a training plan exercise", () => {
    const entry = createWorkoutEntry(
      { exercise: "Puxada alta", loadKg: "55", reps: "10" },
      new Date("2026-05-20T12:02:00.000Z"),
      "set1",
      { id: "plan-1", name: "Treino A1" },
      "exercise-1",
      { id: "session-1", startedAt: "2026-05-20T12:00:00.000Z" }
    );

    assert.equal(entry.planId, "plan-1");
    assert.equal(entry.planName, "Treino A1");
    assert.equal(entry.exerciseId, "exercise-1");
    assert.equal(entry.sessionId, "session-1");
    assert.equal(entry.sessionStartedAt, "2026-05-20T12:00:00.000Z");
  });

  it("groups workout entries by training session", () => {
    const entries = [
      createWorkoutEntry(
        { exercise: "Supino", loadKg: "40", reps: "10" },
        new Date("2026-05-20T12:05:00.000Z"),
        "set1",
        { id: "plan-1", name: "Treino A1" },
        "exercise-1",
        { id: "session-1", startedAt: "2026-05-20T12:00:00.000Z" }
      ),
      createWorkoutEntry(
        { exercise: "Remada", loadKg: "30", reps: "12" },
        new Date("2026-05-20T12:10:00.000Z"),
        "set2",
        { id: "plan-1", name: "Treino A1" },
        "exercise-2",
        { id: "session-2", startedAt: "2026-05-20T12:08:00.000Z" }
      )
    ];

    const sessions = groupWorkoutEntriesBySession(entries);

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].planName, "Treino A1");
    assert.equal(sessions[0].entries.length, 2);
    assert.equal(sessions[0].volume, 760);
  });

  it("calculates training volume", () => {
    const entries = [
      createWorkoutEntry({ exercise: "Supino", loadKg: "40", reps: "10" }),
      createWorkoutEntry({ exercise: "Remada", loadKg: "30", reps: "12" })
    ];

    assert.equal(calculateVolume(entries), 760);
  });
});
