import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInput as TextInputInstance,
  View
} from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp
} from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";

import {
  TrainingPlan,
  TrainingPlanInputErrors,
  WorkoutSession,
  WorkoutEntry,
  WorkoutInputErrors,
  addExerciseToPlan,
  calculateVolume,
  createTrainingPlan,
  createWorkoutEntry,
  groupWorkoutEntriesBySession,
  normalizeExerciseName,
  validatePlanExerciseName,
  validateTrainingPlanName,
  validateWorkoutInput
} from "./src/domain/workout";
import {
  loadTrainingPlans,
  loadWorkouts,
  saveTrainingPlans,
  saveWorkouts
} from "./src/storage/workoutStorage";

type MainTab = "home" | "history";
type RootStackParamList = {
  Main: undefined;
  PlanForm: undefined;
  Session: undefined;
  ExerciseLog: undefined;
};
type AppNavigation = NativeStackNavigationProp<RootStackParamList>;
type ExerciseDraft = { loadKg: string; reps: string };
type ExerciseDrafts = Record<string, ExerciseDraft>;
type ExerciseErrors = Record<string, WorkoutInputErrors>;

const Stack = createNativeStackNavigator<RootStackParamList>();

const emptyDraft: ExerciseDraft = {
  loadKg: "",
  reps: ""
};

const exerciseFocusOffset = 16;
const keyboardScrollDelays = [280];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));

type TrainingPlanCardProps = {
  isLastRegistered: boolean;
  plan: TrainingPlan;
  onEdit: (plan: TrainingPlan) => void;
  onRemove: (plan: TrainingPlan) => void;
  onStart: (plan: TrainingPlan) => void;
};

function TrainingPlanCard({
  isLastRegistered,
  plan,
  onEdit,
  onRemove,
  onStart
}: TrainingPlanCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const animateTo = (value: number) => {
    isOpen.current = value < 0;
    Animated.spring(translateX, {
      toValue: value,
      useNativeDriver: true
    }).start();
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderMove: (_, gesture) => {
          const baseOffset = isOpen.current ? -104 : 0;
          const nextValue = Math.max(-112, Math.min(0, baseOffset + gesture.dx));
          translateX.setValue(nextValue);
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldOpen = isOpen.current ? gesture.dx < 36 : gesture.dx < -44;
          animateTo(shouldOpen ? -104 : 0);
        },
        onPanResponderTerminate: () => animateTo(isOpen.current ? -104 : 0)
      }),
    [translateX]
  );

  const handleRemove = () => {
    animateTo(0);
    onRemove(plan);
  };

  return (
    <View style={styles.swipeCardContainer}>
      <Pressable accessibilityRole="button" style={styles.deleteAction} onPress={handleRemove}>
        <Text style={styles.deleteActionText}>Remover</Text>
      </Pressable>
      <Animated.View
        style={[styles.planCard, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <Pressable accessibilityRole="button" style={styles.planCardMain} onPress={() => onStart(plan)}>
          <Text style={styles.planTitle}>{plan.name}</Text>
          <Text style={styles.planMeta}>
            {plan.exercises.length} exercícios
            {isLastRegistered ? " • último treino registrado" : ""}
          </Text>
        </Pressable>
        <View style={styles.cardActions}>
          <Pressable
            accessibilityRole="button"
            style={styles.smallGhostButton}
            onPress={() => onEdit(plan)}
          >
            <Text style={styles.smallGhostButtonText}>Editar</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [screen, setScreen] = useState<MainTab>("home");
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [entries, setEntries] = useState<WorkoutEntry[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<Pick<WorkoutSession, "id" | "startedAt"> | null>(
    null
  );
  const [planName, setPlanName] = useState("");
  const [planExercise, setPlanExercise] = useState("");
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [editingExerciseName, setEditingExerciseName] = useState("");
  const [editingExerciseError, setEditingExerciseError] = useState<string | null>(null);
  const [planErrors, setPlanErrors] = useState<TrainingPlanInputErrors>({});
  const [drafts, setDrafts] = useState<ExerciseDrafts>({});
  const [exerciseErrors, setExerciseErrors] = useState<ExerciseErrors>({});
  const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({});
  const scrollRef = useRef<ScrollView | null>(null);
  const exerciseCardPositions = useRef<Record<string, number>>({});
  const planExerciseRowPositions = useRef<Record<string, number>>({});
  const planExerciseListY = useRef(0);
  const planNameInputRef = useRef<TextInputInstance | null>(null);
  const planExerciseInputRef = useRef<TextInputInstance | null>(null);
  const editingExerciseInputRef = useRef<TextInputInstance | null>(null);
  const loadInputRefs = useRef<Record<string, TextInputInstance | null>>({});
  const repsInputRefs = useRef<Record<string, TextInputInstance | null>>({});

  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? null;
  const editingPlan = plans.find((plan) => plan.id === editingPlanId) ?? null;
  const volume = useMemo(() => calculateVolume(entries), [entries]);
  const historySessions = useMemo(() => groupWorkoutEntriesBySession(entries), [entries]);

  useEffect(() => {
    Promise.all([loadTrainingPlans(), loadWorkouts()])
      .then(([storedPlans, storedEntries]) => {
        setPlans(storedPlans);
        setEntries(storedEntries);
      })
      .catch(() => {
        setPlans([]);
        setEntries([]);
      });
  }, []);

  const persistPlans = async (nextPlans: TrainingPlan[]) => {
    setPlans(nextPlans);
    await saveTrainingPlans(nextPlans);
  };

  const persistEntries = async (nextEntries: WorkoutEntry[]) => {
    setEntries(nextEntries);
    await saveWorkouts(nextEntries);
  };

  const openNewPlan = (navigation: AppNavigation) => {
    setEditingPlanId(null);
    setPlanName("");
    setPlanExercise("");
    setEditingExerciseId(null);
    setEditingExerciseName("");
    setEditingExerciseError(null);
    setPlanErrors({});
    navigation.navigate("PlanForm");
  };

  const openEditPlan = (navigation: AppNavigation, plan: TrainingPlan) => {
    setEditingPlanId(plan.id);
    setPlanName(plan.name);
    setPlanExercise("");
    setEditingExerciseId(null);
    setEditingExerciseName("");
    setEditingExerciseError(null);
    setPlanErrors({});
    navigation.navigate("PlanForm");
  };

  const startPlan = (navigation: AppNavigation, plan: TrainingPlan) => {
    const startedAt = new Date().toISOString();
    setActivePlanId(plan.id);
    setActiveExerciseId(null);
    setActiveSession({
      id: `${new Date(startedAt).getTime()}-${plan.id}`,
      startedAt
    });
    setDrafts({});
    setExerciseErrors({});
    navigation.navigate("Session");
  };

  const openExerciseLog = (navigation: AppNavigation, exerciseId: string) => {
    setActiveExerciseId(exerciseId);
    setExerciseErrors((current) => ({
      ...current,
      [exerciseId]: {}
    }));
    navigation.navigate("ExerciseLog");
  };

  const savePlanName = async () => {
    const nameErrors = validateTrainingPlanName(planName);
    setPlanErrors(nameErrors);

    if (Object.keys(nameErrors).length > 0) {
      return null;
    }

    if (editingPlan) {
      const updatedPlan = {
        ...editingPlan,
        name: planName.trim().replace(/\s+/g, " "),
        updatedAt: new Date().toISOString()
      };
      const nextPlans = plans.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan));
      await persistPlans(nextPlans);
      return updatedPlan;
    }

    const newPlan = createTrainingPlan(planName);
    await persistPlans([newPlan, ...plans]);
    setEditingPlanId(newPlan.id);
    return newPlan;
  };

  const handleSavePlan = async (navigation: AppNavigation) => {
    const savedPlan = await savePlanName();

    if (savedPlan) {
      setScreen("home");
      navigation.navigate("Main");
    }
  };

  const handleAddExercise = async () => {
    const nameErrors = validateTrainingPlanName(planName);
    const exerciseNameErrors = validatePlanExerciseName(planExercise);
    const nextErrors = { ...nameErrors, ...exerciseNameErrors };
    setPlanErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return false;
    }

    const basePlan = editingPlan ?? createTrainingPlan(planName);
    const updatedPlan = addExerciseToPlan(basePlan, planExercise);
    const nextPlans = editingPlan
      ? plans.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan))
      : [updatedPlan, ...plans];

    await persistPlans(nextPlans);
    const isFirstExercise = basePlan.exercises.length === 0;

    setEditingPlanId(updatedPlan.id);
    setPlanName(updatedPlan.name);
    setPlanExercise("");
    setPlanErrors({});

    if (isFirstExercise) {
      scrollPlanExerciseListIntoView();
    }

    return true;
  };

  const handleDoneAddingPlanExercise = async () => {
    const addedExercise = await handleAddExercise();

    if (addedExercise) {
      setTimeout(() => {
        planExerciseInputRef.current?.focus();
      }, 80);
    }
  };

  const startEditingExercise = (exerciseId: string, exerciseName: string) => {
    setEditingExerciseId(exerciseId);
    setEditingExerciseName(exerciseName);
    setEditingExerciseError(null);

    setTimeout(() => {
      scrollPlanExerciseRowIntoView(exerciseId);
      editingExerciseInputRef.current?.focus();
    }, 80);
  };

  const cancelEditingExercise = () => {
    setEditingExerciseId(null);
    setEditingExerciseName("");
    setEditingExerciseError(null);
  };

  const saveEditedExercise = async (exerciseId: string) => {
    if (!editingPlan) {
      return;
    }

    const exerciseNameErrors = validatePlanExerciseName(editingExerciseName);

    if (exerciseNameErrors.exercise) {
      setEditingExerciseError(exerciseNameErrors.exercise);
      return;
    }

    const updatedPlan = {
      ...editingPlan,
      exercises: editingPlan.exercises.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, name: normalizeExerciseName(editingExerciseName) }
          : exercise
      ),
      updatedAt: new Date().toISOString()
    };

    await persistPlans(plans.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan)));
    cancelEditingExercise();
  };

  const removeExercise = async (exerciseId: string) => {
    if (!editingPlan) {
      return;
    }

    const updatedPlan = {
      ...editingPlan,
      exercises: editingPlan.exercises.filter((exercise) => exercise.id !== exerciseId),
      updatedAt: new Date().toISOString()
    };
    await persistPlans(plans.map((plan) => (plan.id === updatedPlan.id ? updatedPlan : plan)));

    if (editingExerciseId === exerciseId) {
      cancelEditingExercise();
    }
  };

  const removePlan = async (plan: TrainingPlan) => {
    const nextPlans = plans.filter((currentPlan) => currentPlan.id !== plan.id);

    if (editingPlanId === plan.id) {
      setEditingPlanId(null);
    }

    if (activePlanId === plan.id) {
      setActivePlanId(null);
      setActiveExerciseId(null);
      setActiveSession(null);
    }

    await persistPlans(nextPlans);
  };

  const confirmRemovePlan = (plan: TrainingPlan) => {
    const message = `Remover ${plan.name} da lista de treinos? O histórico já registrado será mantido.`;

    if (Platform.OS === "web") {
      const confirmed =
        typeof globalThis.confirm === "function" ? globalThis.confirm(message) : true;

      if (confirmed) {
        removePlan(plan);
      }

      return;
    }

    Alert.alert("Remover treino", message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => removePlan(plan) }
    ]);
  };

  const updateDraft = (exerciseId: string, field: keyof ExerciseDraft, value: string) => {
    setDrafts((current) => ({
      ...current,
      [exerciseId]: {
        ...(current[exerciseId] ?? emptyDraft),
        [field]: value
      }
    }));
    setExerciseErrors((current) => ({
      ...current,
      [exerciseId]: {
        ...current[exerciseId],
        [field === "loadKg" ? "loadKg" : "reps"]: undefined
      }
    }));
  };

  const logExercise = async (exerciseId: string, exerciseName: string) => {
    if (!activePlan) {
      return;
    }

    const draft = drafts[exerciseId] ?? emptyDraft;
    const input = {
      exercise: exerciseName,
      loadKg: draft.loadKg,
      reps: draft.reps
    };
    const nextErrors = validateWorkoutInput(input);

    setExerciseErrors((current) => ({
      ...current,
      [exerciseId]: nextErrors
    }));

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const session = activeSession ?? {
      id: `${Date.now()}-${activePlan.id}`,
      startedAt: new Date().toISOString()
    };
    setActiveSession(session);

    const entry = createWorkoutEntry(input, new Date(), undefined, activePlan, exerciseId, session);
    await persistEntries([entry, ...entries]);
    setDrafts((current) => ({
      ...current,
      [exerciseId]: emptyDraft
    }));
  };

  const removeEntry = async (id: string) => {
    await persistEntries(entries.filter((entry) => entry.id !== id));
  };

  const confirmRemoveEntry = (entry: WorkoutEntry) => {
    if (Platform.OS === "web") {
      const confirmed =
        typeof globalThis.confirm === "function"
          ? globalThis.confirm(`Remover ${entry.exercise}?`)
          : true;

      if (confirmed) {
        removeEntry(entry.id);
      }

      return;
    }

    Alert.alert("Remover registro", `Remover ${entry.exercise}?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Remover", style: "destructive", onPress: () => removeEntry(entry.id) }
    ]);
  };

  const toggleSessionDetails = (sessionId: string) => {
    setExpandedSessions((current) => ({
      ...current,
      [sessionId]: !current[sessionId]
    }));
  };

  const scrollExerciseIntoView = (exerciseId: string) => {
    const y = exerciseCardPositions.current[exerciseId];

    if (y === undefined) {
      return;
    }

    keyboardScrollDelays.forEach((delay) => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          animated: true,
          y: Math.max(0, y - exerciseFocusOffset)
        });
      }, delay);
    });
  };

  const scrollPlanExerciseListIntoView = () => {
    keyboardScrollDelays.forEach((delay) => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          animated: true,
          y: Math.max(0, planExerciseListY.current - 18)
        });
      }, delay);
    });
  };

  const scrollPlanExerciseRowIntoView = (exerciseId: string) => {
    const y = planExerciseRowPositions.current[exerciseId];

    if (y === undefined) {
      return;
    }

    keyboardScrollDelays.forEach((delay) => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          animated: true,
          y: Math.max(0, y - 16)
        });
      }, delay);
    });
  };

  const handleDoneEditingReps = async (exerciseId: string, exerciseName: string) => {
    await logExercise(exerciseId, exerciseName);
    setTimeout(() => {
      scrollExerciseIntoView(exerciseId);
      loadInputRefs.current[exerciseId]?.focus();
    }, 80);
  };

  const renderHeader = (eyebrow: string, title: string) => (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );

  const renderTabs = () => (
    <View style={styles.tabs}>
      <Pressable
        accessibilityRole="button"
        style={[styles.tabButton, screen === "home" ? styles.tabButtonActive : null]}
        onPress={() => setScreen("home")}
      >
        <Text style={[styles.tabButtonText, screen === "home" ? styles.tabButtonTextActive : null]}>
          Hoje
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        style={[styles.tabButton, screen === "history" ? styles.tabButtonActive : null]}
        onPress={() => setScreen("history")}
      >
        <Text style={[styles.tabButtonText, screen === "history" ? styles.tabButtonTextActive : null]}>
          Histórico
        </Text>
      </Pressable>
    </View>
  );

  const renderHome = (navigation: AppNavigation) => {
    const lastEntry = entries[0];

    return (
      <>
        {renderHeader("MVP local", "GymTrackr")}
        {renderTabs()}

        <View style={styles.sectionHeader}>
          <Text style={styles.prompt}>Qual treino você quer fazer hoje?</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() => openNewPlan(navigation)}
          >
            <Text style={styles.secondaryButtonText}>Novo treino</Text>
          </Pressable>
        </View>

        {plans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Crie seu primeiro treino.</Text>
            <Text style={styles.emptyCopy}>
              Um bom começo seria Treino A1 com 3 ou 4 exercícios que você já faz.
            </Text>
            <Pressable
              accessibilityRole="button"
              style={styles.inlineButton}
              onPress={() => openNewPlan(navigation)}
            >
              <Text style={styles.inlineButtonText}>Criar Treino A1</Text>
            </Pressable>
          </View>
        ) : (
          plans.map((plan) => (
            <TrainingPlanCard
              key={plan.id}
              isLastRegistered={lastEntry?.planId === plan.id}
              plan={plan}
              onEdit={(selectedPlan) => openEditPlan(navigation, selectedPlan)}
              onRemove={confirmRemovePlan}
              onStart={(selectedPlan) => startPlan(navigation, selectedPlan)}
            />
          ))
        )}
      </>
    );
  };

  const renderHistory = () => (
    <>
      {renderHeader("Treinos realizados", "Histórico")}
      {renderTabs()}

      <View style={styles.statsRow}>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{historySessions.length}</Text>
          <Text style={styles.statLabel}>treinos</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{entries.length}</Text>
          <Text style={styles.statLabel}>séries</Text>
        </View>
        <View style={styles.statBlock}>
          <Text style={styles.statValue}>{volume.toLocaleString("pt-BR")}</Text>
          <Text style={styles.statLabel}>kg x reps</Text>
        </View>
      </View>

      {historySessions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Nenhum treino realizado ainda.</Text>
          <Text style={styles.emptyCopy}>
            Quando você registrar séries em um treino, elas aparecem agrupadas aqui.
          </Text>
        </View>
      ) : (
        historySessions.map((session) => {
          const isExpanded = expandedSessions[session.id] ?? false;

          return (
            <View key={session.id} style={styles.historyCard}>
              <View style={styles.historyCardHeader}>
                <View style={styles.historyCardTitle}>
                  <Text style={styles.planTitle}>{session.planName}</Text>
                  <Text style={styles.entryMeta}>{formatDate(session.startedAt)}</Text>
                </View>
                <View style={styles.historySummary}>
                  <Text style={styles.entryLoad}>{session.volume.toLocaleString("pt-BR")}</Text>
                  <Text style={styles.entryReps}>
                    {session.entries.length} {session.entries.length === 1 ? "série" : "séries"}
                  </Text>
                </View>
              </View>

              <Pressable
                accessibilityRole="button"
                style={styles.detailsButton}
                onPress={() => toggleSessionDetails(session.id)}
              >
                <Text style={styles.detailsButtonText}>
                  {isExpanded ? "Minimizar treino" : "Ver detalhes"}
                </Text>
              </Pressable>

              {isExpanded ? (
                <View style={styles.sessionEntryList}>
                  {session.entries.map((entry) => (
                    <View key={entry.id} style={styles.sessionEntryRow}>
                      <View style={styles.sessionEntryMain}>
                        <Text style={styles.entryTitle}>{entry.exercise}</Text>
                        <Text style={styles.entryMeta}>{formatDate(entry.createdAt)}</Text>
                      </View>
                      <View style={styles.entryNumbers}>
                        <Text style={styles.entryLoad}>{entry.loadKg} kg</Text>
                        <Text style={styles.entryReps}>{entry.reps} reps</Text>
                        <Pressable
                          accessibilityRole="button"
                          style={styles.entryRemoveButton}
                          onPress={() => confirmRemoveEntry(entry)}
                        >
                          <Text style={styles.entryRemoveButtonText}>Remover</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })
      )}
    </>
  );

  const renderPlanForm = (navigation: AppNavigation) => (
    <>
      {renderHeader(editingPlan ? "Editar treino" : "Novo treino", editingPlan?.name ?? "Montar treino")}

      <View style={styles.navRow}>
        <Pressable accessibilityRole="button" style={styles.smallGhostButton} onPress={() => navigation.goBack()}>
          <Text style={styles.smallGhostButtonText}>Voltar</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={styles.smallPrimaryButton}
          onPress={() => handleSavePlan(navigation)}
        >
          <Text style={styles.smallPrimaryButtonText}>Salvar</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Dados do treino</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Nome do treino</Text>
          <TextInput
            ref={planNameInputRef}
            accessibilityLabel="Nome do treino"
            autoCapitalize="sentences"
            blurOnSubmit={false}
            returnKeyType="next"
            style={[styles.input, planErrors.name ? styles.inputError : null]}
            value={planName}
            onChangeText={(value) => {
              setPlanName(value);
              setPlanErrors((current) => ({ ...current, name: undefined }));
            }}
            onSubmitEditing={() => {
              planExerciseInputRef.current?.focus();
            }}
          />
          {planErrors.name ? <Text style={styles.error}>{planErrors.name}</Text> : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Adicionar exercício</Text>
          <View style={styles.addExerciseRow}>
            <TextInput
              ref={planExerciseInputRef}
              accessibilityLabel="Adicionar exercício"
              autoCapitalize="sentences"
              blurOnSubmit={false}
              returnKeyType="done"
              style={[styles.input, styles.addExerciseInput, planErrors.exercise ? styles.inputError : null]}
              value={planExercise}
              onChangeText={(value) => {
                setPlanExercise(value);
                setPlanErrors((current) => ({ ...current, exercise: undefined }));
              }}
              onSubmitEditing={handleDoneAddingPlanExercise}
            />
            <Pressable accessibilityRole="button" style={styles.squareButton} onPress={handleAddExercise}>
              <Text style={styles.squareButtonText}>+</Text>
            </Pressable>
          </View>
          {planErrors.exercise ? <Text style={styles.error}>{planErrors.exercise}</Text> : null}
        </View>
      </View>

      <View
        style={styles.sectionHeader}
        onLayout={(event) => {
          planExerciseListY.current = event.nativeEvent.layout.y;
        }}
      >
        <Text style={styles.panelTitle}>Exercícios do treino</Text>
        <Text style={styles.historyHint}>{editingPlan?.exercises.length ?? 0} itens</Text>
      </View>

      {!editingPlan || editingPlan.exercises.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Adicione os exercícios deste treino.</Text>
          <Text style={styles.emptyCopy}>
            Depois, esse treino aparece na Home para você iniciar quando quiser.
          </Text>
        </View>
      ) : (
        [...editingPlan.exercises].reverse().map((exercise, index) => (
          <View
            key={exercise.id}
            onLayout={(event) => {
              planExerciseRowPositions.current[exercise.id] = event.nativeEvent.layout.y;
            }}
            style={[styles.exerciseRow, editingExerciseId === exercise.id ? styles.exerciseRowEditing : null]}
          >
            {editingExerciseId === exercise.id ? (
              <>
                <View style={styles.exerciseEditContent}>
                  <TextInput
                    ref={editingExerciseInputRef}
                    accessibilityLabel={`Editar ${exercise.name}`}
                    autoCapitalize="sentences"
                    blurOnSubmit={false}
                    returnKeyType="done"
                    style={[styles.input, styles.exerciseEditInput, editingExerciseError ? styles.inputError : null]}
                    value={editingExerciseName}
                    onChangeText={(value) => {
                      setEditingExerciseName(value);
                      setEditingExerciseError(null);
                    }}
                    onSubmitEditing={() => saveEditedExercise(exercise.id)}
                  />
                  {editingExerciseError ? <Text style={styles.error}>{editingExerciseError}</Text> : null}
                </View>
                <View style={styles.exerciseEditActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Salvar exercício"
                    style={styles.exerciseEditConfirmButton}
                    onPress={() => saveEditedExercise(exercise.id)}
                  >
                    <Text style={styles.exerciseEditConfirmButtonText}>✓</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar edição"
                    style={styles.exerciseEditCancelButton}
                    onPress={cancelEditingExercise}
                  >
                    <Text style={styles.exerciseEditCancelButtonText}>X</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.exerciseRowContent}>
                  <Text style={styles.entryTitle}>{exercise.name}</Text>
                </View>
                <View style={styles.exerciseRowActions}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.compactGhostButton}
                    onPress={() => startEditingExercise(exercise.id, exercise.name)}
                  >
                    <Text style={styles.compactGhostButtonText}>Editar</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.compactGhostButton}
                    onPress={() => removeExercise(exercise.id)}
                  >
                    <Text style={styles.compactGhostButtonText}>Remover</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        ))
      )}
    </>
  );

  const renderSession = (navigation: AppNavigation) => {
    if (!activePlan) {
      return renderHome(navigation);
    }

    return (
      <>
        {renderHeader("Treino de hoje", activePlan.name)}

        <View style={styles.navRow}>
          <Pressable accessibilityRole="button" style={styles.smallGhostButton} onPress={() => navigation.goBack()}>
            <Text style={styles.smallGhostButtonText}>Voltar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.smallGhostButton}
            onPress={() => openEditPlan(navigation, activePlan)}
          >
            <Text style={styles.smallGhostButtonText}>Editar treino</Text>
          </Pressable>
        </View>

        {activePlan.exercises.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Este treino ainda não tem exercícios.</Text>
            <Text style={styles.emptyCopy}>Edite o treino e adicione os aparelhos antes de registrar séries.</Text>
          </View>
        ) : (
          activePlan.exercises.map((exercise, index) => {
            const sessionEntries = entries.filter(
              (entry) => entry.sessionId === activeSession?.id && entry.exerciseId === exercise.id
            );
            const lastEntry = sessionEntries[0];

            return (
              <Pressable
                accessibilityRole="button"
                key={exercise.id}
                style={styles.exerciseSelectCard}
                onPress={() => openExerciseLog(navigation, exercise.id)}
              >
                <View style={styles.exerciseRowMain}>
                  <Text style={styles.exerciseIndex}>{String(index + 1).padStart(2, "0")}</Text>
                  <Text style={styles.entryTitle}>{exercise.name}</Text>
                  <Text style={styles.entryMeta}>
                    {sessionEntries.length === 0
                      ? "Nenhuma série neste treino"
                      : `${sessionEntries.length} ${
                          sessionEntries.length === 1 ? "série" : "séries"
                        } registrada${sessionEntries.length === 1 ? "" : "s"}`}
                  </Text>
                </View>
                <View style={styles.exerciseSelectAside}>
                  {lastEntry ? (
                    <>
                      <Text style={styles.entryLoad}>{lastEntry.loadKg} kg</Text>
                      <Text style={styles.entryReps}>{lastEntry.reps} reps</Text>
                    </>
                  ) : (
                    <Text style={styles.historyHint}>Registrar</Text>
                  )}
                </View>
              </Pressable>
            );
          })
        )}
      </>
    );
  };

  const renderExerciseLog = (navigation: AppNavigation) => {
    if (!activePlan) {
      return renderHome(navigation);
    }

    const exercise = activePlan.exercises.find((item) => item.id === activeExerciseId);

    if (!exercise) {
      return (
        <>
          {renderHeader("Treino de hoje", activePlan.name)}
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Escolha um exercício.</Text>
            <Text style={styles.emptyCopy}>Volte para a lista do treino e selecione o exercício desejado.</Text>
            <Pressable accessibilityRole="button" style={styles.inlineButton} onPress={() => navigation.goBack()}>
              <Text style={styles.inlineButtonText}>Voltar</Text>
            </Pressable>
          </View>
        </>
      );
    }

    const draft = drafts[exercise.id] ?? emptyDraft;
    const errors = exerciseErrors[exercise.id] ?? {};
    const sessionEntries = entries.filter(
      (entry) => entry.sessionId === activeSession?.id && entry.exerciseId === exercise.id
    );

    return (
      <>
        {renderHeader("Registrar série", exercise.name)}

        <View style={styles.navRow}>
          <Pressable accessibilityRole="button" style={styles.smallGhostButton} onPress={() => navigation.goBack()}>
            <Text style={styles.smallGhostButtonText}>Exercícios</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.smallGhostButton}
            onPress={() => openEditPlan(navigation, activePlan)}
          >
            <Text style={styles.smallGhostButtonText}>Editar treino</Text>
          </Pressable>
        </View>

        <View
          onLayout={(event) => {
            exerciseCardPositions.current[exercise.id] = event.nativeEvent.layout.y;
          }}
          style={styles.panel}
        >
          <View style={styles.formRow}>
            <View style={styles.compactField}>
              <Text style={styles.label}>Carga kg</Text>
              <TextInput
                ref={(ref) => {
                  loadInputRefs.current[exercise.id] = ref;
                }}
                accessibilityLabel={`Carga ${exercise.name}`}
                inputMode="decimal"
                keyboardType="decimal-pad"
                blurOnSubmit={false}
                returnKeyType="next"
                style={[styles.input, errors.loadKg ? styles.inputError : null]}
                value={draft.loadKg}
                onChangeText={(value) => updateDraft(exercise.id, "loadKg", value)}
                onFocus={() => scrollExerciseIntoView(exercise.id)}
                onSubmitEditing={() => {
                  scrollExerciseIntoView(exercise.id);
                  repsInputRefs.current[exercise.id]?.focus();
                }}
              />
              {errors.loadKg ? <Text style={styles.error}>{errors.loadKg}</Text> : null}
            </View>
            <View style={styles.compactField}>
              <Text style={styles.label}>Repetições</Text>
              <TextInput
                ref={(ref) => {
                  repsInputRefs.current[exercise.id] = ref;
                }}
                accessibilityLabel={`Repetições ${exercise.name}`}
                inputMode="numeric"
                keyboardType="number-pad"
                blurOnSubmit={false}
                returnKeyType="done"
                style={[styles.input, errors.reps ? styles.inputError : null]}
                value={draft.reps}
                onChangeText={(value) => updateDraft(exercise.id, "reps", value)}
                onFocus={() => scrollExerciseIntoView(exercise.id)}
                onSubmitEditing={() => handleDoneEditingReps(exercise.id, exercise.name)}
              />
              {errors.reps ? <Text style={styles.error}>{errors.reps}</Text> : null}
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() => logExercise(exercise.id, exercise.name)}
          >
            <Text style={styles.primaryButtonText}>Registrar série</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.panelTitle}>Séries deste exercício</Text>
          <Text style={styles.historyHint}>{sessionEntries.length} itens</Text>
        </View>

        {sessionEntries.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nenhuma série registrada ainda.</Text>
            <Text style={styles.emptyCopy}>Registre carga e repetições para acompanhar este exercício no treino.</Text>
          </View>
        ) : (
          <View style={styles.miniHistory}>
            {sessionEntries.map((entry) => (
              <View key={entry.id} style={styles.miniHistoryItem}>
                <View>
                  <Text style={styles.miniHistoryText}>
                    {entry.loadKg} kg • {entry.reps} reps
                  </Text>
                  <Text style={styles.entryMeta}>{formatDate(entry.createdAt)}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  style={styles.entryRemoveButton}
                  onPress={() => confirmRemoveEntry(entry)}
                >
                  <Text style={styles.entryRemoveButtonText}>Remover</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </>
    );
  };

  const renderScreenFrame = (children: ReactNode) => (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          animation: "slide_from_right",
          fullScreenGestureEnabled: true,
          gestureEnabled: true,
          headerShown: false
        }}
      >
        <Stack.Screen name="Main">
          {({ navigation }) =>
            renderScreenFrame(
              <>
                {screen === "home" ? renderHome(navigation) : null}
                {screen === "history" ? renderHistory() : null}
              </>
            )
          }
        </Stack.Screen>
        <Stack.Screen name="PlanForm">
          {({ navigation }) => renderScreenFrame(renderPlanForm(navigation))}
        </Stack.Screen>
        <Stack.Screen name="Session">
          {({ navigation }) => renderScreenFrame(renderSession(navigation))}
        </Stack.Screen>
        <Stack.Screen name="ExerciseLog">
          {({ navigation }) => renderScreenFrame(renderExerciseLog(navigation))}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f7f5f0"
  },
  keyboard: {
    flex: 1
  },
  container: {
    alignSelf: "center",
    gap: 18,
    maxWidth: 760,
    padding: 20,
    paddingBottom: 140,
    width: "100%"
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 16,
    justifyContent: "space-between"
  },
  eyebrow: {
    color: "#6f6a60",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  title: {
    color: "#171513",
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: 0
  },
  statsRow: {
    flexDirection: "row",
    gap: 10
  },
  tabs: {
    backgroundColor: "#ebe5dc",
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    padding: 4
  },
  tabButton: {
    alignItems: "center",
    borderRadius: 7,
    flex: 1,
    justifyContent: "center",
    minHeight: 42
  },
  tabButtonActive: {
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderWidth: 1
  },
  tabButtonText: {
    color: "#6f6a60",
    fontSize: 14,
    fontWeight: "800"
  },
  tabButtonTextActive: {
    color: "#24211d"
  },
  statBlock: {
    backgroundColor: "#24211d",
    borderRadius: 8,
    flex: 1,
    justifyContent: "space-between",
    minHeight: 82,
    padding: 14
  },
  statValue: {
    color: "#ffffff",
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: 0
  },
  statLabel: {
    color: "#cfc8ba",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  prompt: {
    color: "#24211d",
    flex: 1,
    fontSize: 23,
    fontWeight: "800",
    letterSpacing: 0
  },
  panel: {
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16
  },
  panelTitle: {
    color: "#24211d",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0
  },
  field: {
    gap: 6
  },
  formRow: {
    flexDirection: "row",
    gap: 12
  },
  compactField: {
    flex: 1,
    gap: 6
  },
  label: {
    color: "#4b463f",
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    backgroundColor: "#fbfaf7",
    borderColor: "#cfc8ba",
    borderRadius: 8,
    borderWidth: 1,
    color: "#171513",
    fontSize: 18,
    minHeight: 52,
    paddingHorizontal: 14
  },
  inputError: {
    borderColor: "#bd3f32"
  },
  error: {
    color: "#a1342a",
    fontSize: 12,
    fontWeight: "700"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2f6f65",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 18
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800"
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#2f6f65",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: "#2f6f65",
    fontSize: 14,
    fontWeight: "800"
  },
  inlineButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#2f6f65",
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 42,
    paddingHorizontal: 14
  },
  inlineButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  smallPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#2f6f65",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 14
  },
  smallPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800"
  },
  smallGhostButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 14
  },
  smallGhostButtonText: {
    color: "#4b463f",
    fontSize: 14,
    fontWeight: "800"
  },
  compactPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#2f6f65",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 10
  },
  compactPrimaryButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800"
  },
  compactGhostButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 10
  },
  compactGhostButtonText: {
    color: "#4b463f",
    fontSize: 12,
    fontWeight: "800"
  },
  navRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  emptyState: {
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    padding: 18
  },
  emptyTitle: {
    color: "#24211d",
    fontSize: 17,
    fontWeight: "800"
  },
  emptyCopy: {
    color: "#6f6a60",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6
  },
  swipeCardContainer: {
    borderRadius: 8,
    minHeight: 86,
    overflow: "hidden",
    position: "relative"
  },
  deleteAction: {
    alignItems: "center",
    backgroundColor: "#a13a31",
    bottom: 0,
    justifyContent: "center",
    position: "absolute",
    right: 0,
    top: 0,
    width: 104
  },
  deleteActionText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900"
  },
  planCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 86,
    padding: 14
  },
  planCardMain: {
    flex: 1,
    gap: 5
  },
  planTitle: {
    color: "#171513",
    fontSize: 19,
    fontWeight: "900"
  },
  planMeta: {
    color: "#756f65",
    fontSize: 13,
    fontWeight: "700"
  },
  historyCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 14
  },
  historyCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  historyCardTitle: {
    flex: 1
  },
  historySummary: {
    alignItems: "flex-end"
  },
  detailsButton: {
    alignItems: "center",
    backgroundColor: "#fbfaf7",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    paddingHorizontal: 14
  },
  detailsButtonText: {
    color: "#2f6f65",
    fontSize: 14,
    fontWeight: "800"
  },
  sessionEntryList: {
    borderTopColor: "#ece7de",
    borderTopWidth: 1,
    gap: 10,
    paddingTop: 12
  },
  sessionEntryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  sessionEntryMain: {
    flex: 1
  },
  cardActions: {
    flexDirection: "row",
    gap: 8
  },
  addExerciseRow: {
    flexDirection: "row",
    gap: 10
  },
  addExerciseInput: {
    flex: 1
  },
  squareButton: {
    alignItems: "center",
    backgroundColor: "#2f6f65",
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 52,
    width: 56
  },
  squareButtonText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900"
  },
  exerciseRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 76,
    padding: 14
  },
  exerciseRowEditing: {
    alignItems: "center"
  },
  exerciseRowContent: {
    flex: 1,
    minWidth: 0
  },
  exerciseRowActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end"
  },
  exerciseEditContent: {
    flex: 1,
    gap: 10,
    minWidth: 0
  },
  exerciseEditInput: {
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12
  },
  exerciseEditActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    width: 88
  },
  exerciseEditConfirmButton: {
    alignItems: "center",
    backgroundColor: "#2f6f65",
    borderRadius: 8,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  exerciseEditConfirmButtonText: {
    color: "#ffffff",
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 22
  },
  exerciseEditCancelButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  exerciseEditCancelButtonText: {
    color: "#4b463f",
    fontSize: 16,
    fontWeight: "900",
    lineHeight: 20
  },
  exerciseSelectCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 84,
    padding: 14
  },
  exerciseRowMain: {
    flex: 1
  },
  exerciseSelectAside: {
    alignItems: "flex-end",
    minWidth: 82
  },
  exerciseIndex: {
    color: "#2f6f65",
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 3
  },
  exerciseHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  historyHint: {
    color: "#6f6a60",
    fontSize: 13,
    fontWeight: "700"
  },
  entry: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between",
    minHeight: 78,
    padding: 14
  },
  entryTitle: {
    color: "#171513",
    fontSize: 17,
    fontWeight: "800"
  },
  entryMeta: {
    color: "#756f65",
    fontSize: 13,
    marginTop: 4
  },
  entryNumbers: {
    alignItems: "flex-end"
  },
  entryLoad: {
    color: "#2f6f65",
    fontSize: 18,
    fontWeight: "900"
  },
  entryReps: {
    color: "#4b463f",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4
  },
  entryRemoveButton: {
    alignItems: "center",
    borderColor: "#dfd9ce",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 32,
    paddingHorizontal: 10
  },
  entryRemoveButtonText: {
    color: "#7d3029",
    fontSize: 12,
    fontWeight: "800"
  },
  miniHistory: {
    borderTopColor: "#ece7de",
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12
  },
  miniHistoryItem: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  miniHistoryText: {
    color: "#2f6f65",
    fontSize: 14,
    fontWeight: "900"
  }
});
