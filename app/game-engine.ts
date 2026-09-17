import { ACTIONS, type ActionLabel } from "./movement-recognition";

export const MIN_ATTACK_DELAY = 900;
export const MAX_ATTACK_DELAY = 2_400;
export const OPPONENT_DODGE_CHANCE = 0.25;
export const OPPONENT_DODGE_COOLDOWN = 1_800;
export const MAX_CONSECUTIVE_OPPONENT_DODGES = 2;

export const COMBAT_CONFIG = {
  playerMaxHealth: 100,
  opponentHealth: [90, 115, 105, 135],
  attackDamage: 15,
  specialDamage: 30,
  reflectedDamage: 12,
  opponentDamage: [10, 12, 14, 16],
  blockReduction: 0.8,
  blockWindowMs: 1_500,
  dodgeWindowMs: 2_000,
  opponentWarningMs: [1_250, 1_000, 900, 800],
  energyAttack: 10,
  energyBlock: 12,
  energyDodge: 15,
  energyHitTaken: 4,
  passiveEnergy: 0,
  defenseInputBufferMs: 350,
  defenseGraceMs: 180,
  specialCost: 100,
  specialChargeDurationMs: 15_000,
} as const;

export type ActionSource = "movement" | "keyboard";
export type ActionEvent = {
  action: ActionLabel;
  timestampMs: number;
  source: ActionSource;
};
export type ProjectileStatus =
  | "PLAYER_TRAVEL"
  | "ENEMY_TRAVEL"
  | "SHIELD_CONTACT"
  | "PLAYER_REFLECTED_TRAVEL";
export type CombatProjectile = {
  id: number;
  owner: "PLAYER" | "ENEMY";
  sourceOwner: "PLAYER" | "ENEMY";
  status: ProjectileStatus;
  spawnedAt: number;
  impactAt: number;
  damage: number;
  sourceProjectileId?: number;
  reflected?: boolean;
  special?: boolean;
  opponentDodged?: boolean;
};

export type Feedback =
  | "Incoming attack!"
  | "ATTACK!"
  | "BLOCKED!"
  | "REFLECTED!"
  | "DODGED!"
  | "HIT!"
  | "SPECIAL!"
  | "MISS!"
  | `SPECIAL CHARGING — ${number}%`;

export type Prediction = {
  probabilities: Record<ActionLabel, number>;
  predictedAction: ActionLabel;
  confidence: number;
};

export type BattleState = {
  battleNumber: number;
  playerHealth: number;
  opponentHealth: number;
  specialEnergy: number;
  specialChargeStartedAt: number;
  lastAttackAt: number;
  blockUntil: number;
  dodgeUntil: number;
  blockStartedAt: number;
  dodgeStartedAt: number;
  opponentGuardUntil: number;
  opponentDodgeCooldownUntil: number;
  opponentDodgeUntil: number;
  consecutiveOpponentDodges: number;
  opponentAttackAt: number | null;
  lastDefense: { action: "BLOCK" | "DODGE"; timestampMs: number } | null;
  playerCombatState: "NORMAL" | "BLOCKING" | "DODGING";
  nextOpponentDecisionAt: number;
  feedback: Feedback | "Get ready!";
  playerAnimation: ActionLabel | "HIT" | "IDLE" | "VICTORY" | "DEFEAT";
  opponentAnimation: ActionLabel | "HIT" | "IDLE" | "VICTORY" | "DEFEAT";
  animationVersion: number;
  animationResetAt: number;
  status: "playing" | "won" | "lost";
  projectiles: CombatProjectile[];
  impactKind: "NORMAL" | "SPECIAL" | "REFLECTED" | null;
  anticipatedAction: ActionLabel | null;
};

export type ActionMetric = {
  action: ActionLabel;
  timestampMs: number;
  battleNumber: number;
  source: ActionSource;
  outcome: string;
};

export type PredictionMetric = {
  timestampMs: number;
  battleNumber: number;
  predictedAction: ActionLabel;
  actualAction: ActionLabel;
  confidence: number;
  correct: boolean;
};

export type BattleResult = {
  battleNumber: number;
  won: boolean;
  playerHealth: number;
  durationMs: number;
};

export type GameplayData = {
  sessionStartedAt: number;
  actions: ActionMetric[];
  predictions: PredictionMetric[];
  battles: BattleResult[];
  successfulAttacks: number;
  successfulBlocks: number;
  successfulDodges: number;
  successfulSpecials: number;
};

export const OPPONENTS = [
  { name: "Moxie", subtitle: "The eager training beast" },
  { name: "Iron Vex", subtitle: "Fast, armored and reactive" },
  { name: "Oracle Maw", subtitle: "A creature that finds patterns" },
  { name: "Nyx Prime", subtitle: "The adaptive arena champion" },
] as const;

export function createGameplayData(): GameplayData {
  return {
    sessionStartedAt: performance.now(),
    actions: [],
    predictions: [],
    battles: [],
    successfulAttacks: 0,
    successfulBlocks: 0,
    successfulDodges: 0,
    successfulSpecials: 0,
  };
}

export function createBattle(battleNumber: number, now: number): BattleState {
  return {
    battleNumber,
    playerHealth: COMBAT_CONFIG.playerMaxHealth,
    opponentHealth: COMBAT_CONFIG.opponentHealth[battleNumber - 1],
    specialEnergy: 0,
    specialChargeStartedAt: now,
    lastAttackAt: -Infinity,
    blockUntil: 0,
    dodgeUntil: 0,
    blockStartedAt: -Infinity,
    dodgeStartedAt: -Infinity,
    opponentGuardUntil: 0,
    opponentDodgeCooldownUntil: 0,
    opponentDodgeUntil: 0,
    consecutiveOpponentDodges: 0,
    opponentAttackAt: null,
    lastDefense: null,
    playerCombatState: "NORMAL",
    nextOpponentDecisionAt: now + randomAttackDelay(),
    feedback: "Get ready!",
    playerAnimation: "IDLE",
    opponentAnimation: "IDLE",
    animationVersion: 0,
    animationResetAt: 0,
    status: "playing",
    projectiles: [],
    impactKind: null,
    anticipatedAction: null,
  };
}

function randomAttackDelay(random: () => number = Math.random) {
  return MIN_ATTACK_DELAY + random() * (MAX_ATTACK_DELAY - MIN_ATTACK_DELAY);
}

function normalizedCounts(history: ActionLabel[]) {
  const counts = Object.fromEntries(ACTIONS.map((action) => [action, 1])) as Record<
    ActionLabel,
    number
  >;
  for (const action of history) counts[action] += 1;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(
    ACTIONS.map((action) => [action, counts[action] / total]),
  ) as Record<ActionLabel, number>;
}

export function predictNextAction(
  history: ActionLabel[],
  battleNumber: number,
): Prediction {
  const base = normalizedCounts(history);
  const scores = { ...base };
  const last = history.at(-1);
  const previous = history.at(-2);

  if (battleNumber >= 3 && last) {
    const following = Object.fromEntries(ACTIONS.map((action) => [action, 1])) as Record<
      ActionLabel,
      number
    >;
    for (let index = 0; index < history.length - 1; index += 1) {
      if (history[index] === last) following[history[index + 1]] += 1;
    }
    const total = Object.values(following).reduce((sum, value) => sum + value, 0);
    for (const action of ACTIONS) {
      scores[action] = scores[action] * 0.35 + (following[action] / total) * 0.65;
    }
  }

  if (battleNumber >= 4 && previous && last) {
    const following = Object.fromEntries(ACTIONS.map((action) => [action, 1])) as Record<
      ActionLabel,
      number
    >;
    let observations = 0;
    for (let index = 0; index < history.length - 2; index += 1) {
      if (history[index] === previous && history[index + 1] === last) {
        following[history[index + 2]] += 1;
        observations += 1;
      }
    }
    if (observations >= 2) {
      const total = Object.values(following).reduce((sum, value) => sum + value, 0);
      for (const action of ACTIONS) {
        scores[action] = scores[action] * 0.35 + (following[action] / total) * 0.65;
      }
    }

    const recent = normalizedCounts(history.slice(-8));
    for (const action of ACTIONS) {
      scores[action] = scores[action] * 0.75 + recent[action] * 0.25;
    }
  }

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  const probabilities = Object.fromEntries(
    ACTIONS.map((action) => [action, scores[action] / total]),
  ) as Record<ActionLabel, number>;
  const predictedAction = [...ACTIONS].sort(
    (first, second) => probabilities[second] - probabilities[first],
  )[0];
  return {
    probabilities,
    predictedAction,
    confidence: probabilities[predictedAction],
  };
}

export function applyPlayerAction(
  state: BattleState,
  event: ActionEvent,
  history: ActionLabel[],
  random: () => number = Math.random,
): { state: BattleState; metric: ActionMetric; prediction: PredictionMetric | null; acceptedAction: ActionLabel | null } {
  if (state.status !== "playing") {
    return {
      state,
      metric: {
        action: event.action,
        timestampMs: event.timestampMs,
        battleNumber: state.battleNumber,
        source: event.source,
        outcome: "ignored",
      },
      prediction: null,
      acceptedAction: null,
    };
  }

  const prediction = predictNextAction(history, state.battleNumber);
  const predictedCorrectly = prediction.predictedAction === event.action;
  const next: BattleState = { ...state };
  if (history.length >= 2 && state.battleNumber >= 2) {
    next.anticipatedAction = prediction.predictedAction;
  }
  const defenseFrequency = state.battleNumber === 2 ? 4 : state.battleNumber === 3 ? 3 : 2;
  const opponentReadsPastPattern =
    state.battleNumber >= 2 &&
    history.length >= defenseFrequency &&
    history.length % defenseFrequency === 0 &&
    predictedCorrectly &&
    (event.action === "ATTACK" || event.action === "SPECIAL");
  if (opponentReadsPastPattern) {
    next.opponentGuardUntil = event.timestampMs + 1_100;
    next.opponentAnimation = "BLOCK";
  }
  let outcome = "used";
  let acceptedAction: ActionLabel | null = null;

  if (event.action === "ATTACK") {
    if (event.timestampMs - next.lastAttackAt < 700) {
      next.feedback = "MISS!";
      return { state: next, metric: { ...event, battleNumber: state.battleNumber, outcome: "cooldown" }, prediction: null, acceptedAction: null };
    }
    next.lastAttackAt = event.timestampMs;
    const opponentCanDodge =
      event.timestampMs >= next.opponentDodgeCooldownUntil &&
      next.consecutiveOpponentDodges < MAX_CONSECUTIVE_OPPONENT_DODGES &&
      next.opponentAnimation === "IDLE" &&
      !next.projectiles.some((projectile) => projectile.owner === "ENEMY") &&
      next.opponentAttackAt === null;
    const opponentDodged = opponentCanDodge && random() < OPPONENT_DODGE_CHANCE;
    next.projectiles = [...next.projectiles, { id: event.timestampMs, owner: "PLAYER", sourceOwner: "PLAYER", status: "PLAYER_TRAVEL", spawnedAt: event.timestampMs, impactAt: event.timestampMs + 500, damage: COMBAT_CONFIG.attackDamage, opponentDodged }];
    if (opponentDodged) {
      next.opponentAnimation = "DODGE";
      next.opponentDodgeUntil = event.timestampMs + 500;
      next.opponentDodgeCooldownUntil = event.timestampMs + OPPONENT_DODGE_COOLDOWN;
      next.consecutiveOpponentDodges += 1;
    }
    next.opponentHealth = next.opponentHealth;
    next.feedback = "ATTACK!";
    outcome = "projectile-launched";
    acceptedAction = "ATTACK";
  } else if (event.action === "BLOCK") {
    next.blockStartedAt = event.timestampMs;
    next.blockUntil = event.timestampMs + COMBAT_CONFIG.blockWindowMs;
    next.animationResetAt = next.blockUntil;
    next.lastDefense = { action: "BLOCK", timestampMs: event.timestampMs };
    next.playerCombatState = "BLOCKING";
    next.feedback = "BLOCKED!";
    outcome = "guarding";
    acceptedAction = "BLOCK";
  } else if (event.action === "DODGE") {
    next.dodgeStartedAt = event.timestampMs;
    next.dodgeUntil = event.timestampMs + COMBAT_CONFIG.dodgeWindowMs;
    next.animationResetAt = next.dodgeUntil;
    next.lastDefense = { action: "DODGE", timestampMs: event.timestampMs };
    next.playerCombatState = "DODGING";
    next.feedback = "DODGED!";
    outcome = "dodging";
    acceptedAction = "DODGE";
  } else if (next.specialEnergy < COMBAT_CONFIG.specialCost) {
    next.feedback = `SPECIAL CHARGING — ${Math.round(next.specialEnergy)}%`;
    outcome = "charging";
  } else {
    next.specialEnergy = 0;
    next.specialChargeStartedAt = event.timestampMs;
    next.projectiles = [...next.projectiles, { id: event.timestampMs, owner: "PLAYER", sourceOwner: "PLAYER", status: "PLAYER_TRAVEL", spawnedAt: event.timestampMs + 520, impactAt: event.timestampMs + 1_050, damage: COMBAT_CONFIG.specialDamage, special: true }];
    next.feedback = "SPECIAL!";
    outcome = "special-launched";
    acceptedAction = "SPECIAL";
  }

  if (acceptedAction) {
    next.playerAnimation = acceptedAction;
    next.animationVersion = state.animationVersion + 1;
    if (acceptedAction === "ATTACK" || acceptedAction === "SPECIAL") {
      next.animationResetAt = event.timestampMs + (acceptedAction === "SPECIAL" ? 1_050 : 480);
      if (acceptedAction === "ATTACK" && next.opponentDodgeUntil > event.timestampMs) {
        next.animationResetAt = next.opponentDodgeUntil;
      }
    }
  }

  if (next.opponentHealth <= 0) {
    next.status = "won";
    next.playerAnimation = "VICTORY";
    next.opponentAnimation = "DEFEAT";
  }
  return {
    state: next,
    metric: {
      action: event.action,
      timestampMs: event.timestampMs,
      battleNumber: state.battleNumber,
      source: event.source,
      outcome,
    },
    prediction:
      acceptedAction && history.length > 0
        ? {
            timestampMs: event.timestampMs,
            battleNumber: state.battleNumber,
            predictedAction: prediction.predictedAction,
            actualAction: event.action,
            confidence: prediction.confidence,
            correct: predictedCorrectly,
          }
        : null,
    acceptedAction,
  };
}

export type EnemyImpactResolution = "HIT" | "DODGED" | "REFLECTED";

export function resolveEnemyProjectileImpact(
  state: BattleState,
  projectile: CombatProjectile,
  impactTime: number,
): { state: BattleState; resolution: EnemyImpactResolution; events: string[] } {
  const dodgeActive = impactTime >= state.dodgeStartedAt && impactTime <= state.dodgeUntil;
  const blockActive = impactTime >= state.blockStartedAt && impactTime <= state.blockUntil;
  const before = state.playerHealth;
  const events = [
    `PROJECTILE #${projectile.id} player impact · impactTime ${Math.round(impactTime)}`,
    `DODGE ACTIVE: ${dodgeActive ? "YES" : "NO"} · BLOCK ACTIVE: ${blockActive ? "YES" : "NO"}`,
  ];

  if (dodgeActive) {
    return {
      state: { ...state, feedback: "DODGED!" },
      resolution: "DODGED",
      events: [...events, `RESOLUTION: DODGED · PLAYER DAMAGE: 0 · PLAYER HP: ${before} → ${before}`],
    };
  }

  if (blockActive) {
    const reflected: CombatProjectile = {
      id: projectile.id + 1_000_000,
      owner: "PLAYER",
      sourceOwner: "ENEMY",
      sourceProjectileId: projectile.id,
      status: "SHIELD_CONTACT",
      spawnedAt: impactTime + 160,
      impactAt: impactTime + 610,
      damage: COMBAT_CONFIG.reflectedDamage,
      reflected: true,
    };
    return {
      state: {
        ...state,
        feedback: "REFLECTED!",
        playerAnimation: "BLOCK",
        animationVersion: state.animationVersion + 1,
        animationResetAt: impactTime + 710,
        impactKind: "REFLECTED",
        projectiles: [...state.projectiles, reflected],
      },
      resolution: "REFLECTED",
      events: [
        ...events,
        `RESOLUTION: REFLECTED · PLAYER DAMAGE: 0 · PLAYER HP: ${before} → ${before}`,
        `REFLECTED PROJECTILE #${reflected.id} · damage ${reflected.damage} · contact 160ms · travel start ${Math.round(reflected.spawnedAt)}`,
      ],
    };
  }

  const playerHealth = Math.max(0, before - projectile.damage);
  return {
    state: {
      ...state,
      playerHealth,
      feedback: "HIT!",
      playerAnimation: "HIT",
      animationVersion: state.animationVersion + 1,
      animationResetAt: impactTime + 280,
      impactKind: "NORMAL",
    },
    resolution: "HIT",
    events: [...events, `RESOLUTION: HIT · PLAYER DAMAGE: ${projectile.damage} · PLAYER HP: ${before} → ${playerHealth}`],
  };
}

export function advanceOpponent(
  state: BattleState,
  now: number,
): { state: BattleState; outcome: "block" | "dodge" | "hit" | null; events: string[] } {
  if (state.status !== "playing") return { state, outcome: null, events: [] };
  const timedEnergy = Math.min(100, Math.max(0, ((now - state.specialChargeStartedAt) / COMBAT_CONFIG.specialChargeDurationMs) * 100));
  if (timedEnergy !== state.specialEnergy) state = { ...state, specialEnergy: timedEnergy };
  const roundIndex = state.battleNumber - 1;

  const startedReflections = state.projectiles.map((projectile) =>
    projectile.status === "SHIELD_CONTACT" && now >= projectile.spawnedAt
      ? { ...projectile, status: "PLAYER_REFLECTED_TRAVEL" as const }
      : projectile,
  );
  if (startedReflections.some((projectile, index) => projectile !== state.projectiles[index])) {
    state = { ...state, projectiles: startedReflections };
  }

  const due = state.projectiles.filter((projectile) => now >= projectile.impactAt);
  if (due.length) {
    let next = { ...state, projectiles: state.projectiles.filter((projectile) => now < projectile.impactAt) };
    let outcome: "block" | "dodge" | "hit" | null = null;
    const events: string[] = [];
    let enemyAttackCompleted = false;
    for (const projectile of due) {
      if (projectile.owner === "PLAYER" && projectile.opponentDodged) {
        const before = next.opponentHealth;
        next.feedback = "MISS!";
        next.opponentAnimation = "IDLE";
        next.opponentDodgeUntil = 0;
        next.impactKind = null;
        events.push(`PLAYER PROJECTILE #${projectile.id} · OPPONENT DODGED · ENEMY HP: ${before} → ${before}`);
      } else if (projectile.owner === "PLAYER") {
        const before = next.opponentHealth;
        const guardedDamage = now <= next.opponentGuardUntil ? Math.ceil(projectile.damage * 0.5) : projectile.damage;
        next.opponentHealth = Math.max(0, next.opponentHealth - guardedDamage);
        next.feedback = projectile.reflected ? "REFLECTED!" : "HIT!";
        next.opponentAnimation = "HIT";
        next.consecutiveOpponentDodges = 0;
        next.animationVersion += 1;
        next.animationResetAt = now + 300;
        next.impactKind = projectile.special ? "SPECIAL" : projectile.reflected ? "REFLECTED" : "NORMAL";
        if (projectile.reflected) events.push(`REFLECTED PROJECTILE #${projectile.id} enemy impact · ENEMY HP: ${before} → ${next.opponentHealth}`);
      } else {
        enemyAttackCompleted = true;
        const resolved = resolveEnemyProjectileImpact(next, projectile, projectile.impactAt);
        next = resolved.state;
        events.push(...resolved.events);
        outcome = resolved.resolution === "DODGED" ? "dodge" : resolved.resolution === "REFLECTED" ? "block" : "hit";
      }
    }
    if (enemyAttackCompleted) next.nextOpponentDecisionAt = now + randomAttackDelay();
    const won = next.opponentHealth <= 0;
    const lost = next.playerHealth <= 0;
    next.status = won ? "won" : lost ? "lost" : "playing";
    if (won) { next.playerAnimation = "VICTORY"; next.opponentAnimation = "DEFEAT"; }
    if (lost) { next.playerAnimation = "DEFEAT"; next.opponentAnimation = "VICTORY"; }
    return { state: next, outcome, events };
  }

  if (
    state.opponentAttackAt === null &&
    state.animationResetAt > 0 &&
    now >= state.animationResetAt &&
    (state.playerAnimation !== "IDLE" || state.opponentAnimation !== "IDLE")
  ) {
    return {
      state: {
        ...state,
        playerAnimation: "IDLE",
        opponentAnimation: "IDLE",
        playerCombatState: "NORMAL",
        impactKind: null,
        animationResetAt: 0,
      },
      outcome: null,
      events: [],
    };
  }

  const enemyProjectileActive = state.projectiles.some((projectile) => projectile.owner === "ENEMY");
  if (state.opponentAttackAt === null && !enemyProjectileActive && now >= state.nextOpponentDecisionAt) {
    return {
      state: {
        ...state,
        opponentAttackAt: now + COMBAT_CONFIG.opponentWarningMs[roundIndex],
        nextOpponentDecisionAt: Infinity,
        feedback: "Incoming attack!",
        lastDefense: null,
        playerCombatState: "NORMAL",
        opponentAnimation: "ATTACK",
        animationVersion: state.animationVersion + 1,
        animationResetAt: 0,
      },
      outcome: null,
      events: [],
    };
  }

  if (state.opponentAttackAt !== null && !enemyProjectileActive && now >= state.opponentAttackAt) {
    const projectile: CombatProjectile = { id: state.opponentAttackAt, owner: "ENEMY", sourceOwner: "ENEMY", status: "ENEMY_TRAVEL", spawnedAt: state.opponentAttackAt, impactAt: state.opponentAttackAt + 500, damage: COMBAT_CONFIG.opponentDamage[roundIndex] };
    return {
      state: {
        ...state,
        projectiles: [...state.projectiles, projectile],
        opponentAttackAt: null,
        feedback: "Incoming attack!",
        opponentAnimation: "ATTACK",
        animationVersion: state.animationVersion + 1,
        animationResetAt: now + 420,
      },
      outcome: null,
      events: [`PROJECTILE #${projectile.id} spawned · owner: enemy · damage: ${projectile.damage}`],
    };
  }
  return { state, outcome: null, events: [] };
}

export function favoriteSequence(history: ActionLabel[]) {
  if (history.length < 3) return null;
  const counts = new Map<string, number>();
  for (let index = 0; index <= history.length - 3; index += 1) {
    const sequence = history.slice(index, index + 3).join(" → ");
    counts.set(sequence, (counts.get(sequence) ?? 0) + 1);
  }
  return [...counts.entries()].sort((first, second) => second[1] - first[1])[0] ?? null;
}

export type CombatSelfTest = {
  attackDamages: boolean;
  blockReducesDamage: boolean;
  dodgeAvoidsDamage: boolean;
  specialNeedsEnergy: boolean;
  specialDamagesWhenReady: boolean;
  enemyCanBeDefeated: boolean;
  playerCanBeDefeated: boolean;
  repeatedAttacks: boolean;
  specialTiming: boolean;
  dodgeTimingScenario: boolean;
  dodgeExpiryScenario: boolean;
  blockTimingScenario: boolean;
  passed: boolean;
};

export function runCombatSelfTest(): CombatSelfTest {
  const now = 10_000;
  const neverDodge = () => 1;
  const enemyProjectile = (id: number, impactAt: number, damage = 10): CombatProjectile => ({
    id, owner: "ENEMY", sourceOwner: "ENEMY", status: "ENEMY_TRAVEL",
    spawnedAt: impactAt - 500, impactAt, damage,
  });
  const noDefense = advanceOpponent({ ...createBattle(1, now), projectiles: [enemyProjectile(1, now)] }, now).state;
  const attackDamages = noDefense.playerHealth === 90;
  const blocking = applyPlayerAction(createBattle(1, now - 500), { action: "BLOCK", timestampMs: now - 200, source: "keyboard" }, []).state;
  const blocked = advanceOpponent({ ...blocking, projectiles: [enemyProjectile(2, now)] }, now).state;
  const reflected = blocked.projectiles.find((projectile) => projectile.reflected);
  const blockReducesDamage = blocked.playerHealth === 100 && Boolean(reflected) && blocked.opponentHealth === 90;
  const reflectedImpact = reflected ? advanceOpponent(blocked, reflected.impactAt).state : blocked;
  const dodging = applyPlayerAction(createBattle(1, now - 500), { action: "DODGE", timestampMs: now - 200, source: "keyboard" }, []).state;
  const dodged = advanceOpponent({ ...dodging, projectiles: [enemyProjectile(3, now)] }, now).state;
  const dodgeAvoidsDamage = dodged.playerHealth === 100 && dodged.opponentHealth === 90;
  const dodgeExpired = advanceOpponent({ ...dodging, projectiles: [enemyProjectile(4, dodging.dodgeUntil + 100)] }, dodging.dodgeUntil + 100).state;
  const blockExpired = advanceOpponent({ ...blocking, projectiles: [enemyProjectile(5, blocking.blockUntil + 100)] }, blocking.blockUntil + 100).state;

  const uncharged = applyPlayerAction(
    createBattle(1, now),
    { action: "SPECIAL", timestampMs: now, source: "keyboard" },
    [],
  );
  const charged = applyPlayerAction(
    { ...createBattle(1, now), specialEnergy: 100 },
    { action: "SPECIAL", timestampMs: now, source: "keyboard" },
    [],
  );
  const specialNeedsEnergy = uncharged.metric.outcome === "charging";
  const specialDamagesWhenReady = charged.metric.outcome === "special-launched";

  let enemy = { ...createBattle(1, now), opponentHealth: 30 };
  for (let index = 0; index < 2 && enemy.status === "playing"; index += 1) {
    const shotAt = now + index * 1_000;
    enemy = applyPlayerAction(enemy, { action: "ATTACK", timestampMs: shotAt, source: "keyboard" }, [], neverDodge).state;
    enemy = advanceOpponent(enemy, shotAt + 500).state;
  }
  const enemyCanBeDefeated = enemy.status === "won";
  let repeated = createBattle(1, now);
  let repeatedHits = 0;
  for (let index = 0; index < 4; index += 1) {
    const attack = applyPlayerAction(repeated, { action: "ATTACK", timestampMs: now + index * 1_000, source: "keyboard" }, [], neverDodge);
    repeated = attack.state;
    if (attack.metric.outcome === "projectile-launched") { repeatedHits += 1; repeated = advanceOpponent(repeated, now + index * 1_000 + 500).state; }
  }
  const repeatedAttacks = repeatedHits === 4 && repeated.opponentHealth === COMBAT_CONFIG.opponentHealth[0] - COMBAT_CONFIG.attackDamage * 4;
  const specialTiming = advanceOpponent(createBattle(1, now), now + 7_500).state.specialEnergy >= 49 &&
    advanceOpponent(createBattle(1, now), now + 15_000).state.specialEnergy === 100;
  const playerCanBeDefeated =
    advanceOpponent({ ...createBattle(4, now), playerHealth: 1, projectiles: [enemyProjectile(9, now, 16)] }, now).state.status === "lost";
  return {
    attackDamages,
    blockReducesDamage,
    dodgeAvoidsDamage,
    specialNeedsEnergy,
    specialDamagesWhenReady,
    enemyCanBeDefeated,
    playerCanBeDefeated,
    repeatedAttacks,
    specialTiming,
    dodgeTimingScenario: dodged.playerHealth === COMBAT_CONFIG.playerMaxHealth,
    dodgeExpiryScenario: dodgeExpired.playerHealth < COMBAT_CONFIG.playerMaxHealth,
    blockTimingScenario: blockExpired.playerHealth < COMBAT_CONFIG.playerMaxHealth,
    passed: attackDamages && blockReducesDamage && dodgeAvoidsDamage &&
      specialNeedsEnergy && specialDamagesWhenReady && enemyCanBeDefeated &&
      playerCanBeDefeated && dodged.playerHealth === COMBAT_CONFIG.playerMaxHealth &&
      dodgeExpired.playerHealth < COMBAT_CONFIG.playerMaxHealth &&
      blockExpired.playerHealth < COMBAT_CONFIG.playerMaxHealth && reflectedImpact.opponentHealth === 78 && repeatedAttacks && specialTiming,
  };
}

export function runAcceptedActionConsistencyTests() {
  const now = 20_000;
  const attack = applyPlayerAction(createBattle(1, now), { action: "ATTACK", timestampMs: now + 1, source: "keyboard" }, [], () => 1);
  const block = applyPlayerAction(createBattle(1, now), { action: "BLOCK", timestampMs: now + 1, source: "keyboard" }, []);
  const dodge = applyPlayerAction(createBattle(1, now), { action: "DODGE", timestampMs: now + 1, source: "keyboard" }, []);
  const specialReady = applyPlayerAction({ ...createBattle(1, now), specialEnergy: 100 }, { action: "SPECIAL", timestampMs: now + 1, source: "keyboard" }, []);
  const specialNotReady = applyPlayerAction({ ...createBattle(1, now), specialEnergy: 40 }, { action: "SPECIAL", timestampMs: now + 1, source: "keyboard" }, []);
  const stoppedBattle = { ...createBattle(1, now), status: "won" as const };
  const rejectedDodge = applyPlayerAction(stoppedBattle, { action: "DODGE", timestampMs: now + 1, source: "keyboard" }, []);
  return {
    attackAcceptedOnceWithOneProjectile: attack.acceptedAction === "ATTACK" && attack.state.playerAnimation === "ATTACK" && attack.state.projectiles.length === 1,
    blockActivatesCharacterGuard: block.acceptedAction === "BLOCK" && block.state.playerCombatState === "BLOCKING" && block.state.playerAnimation === "BLOCK",
    dodgeActivatesCharacterDodge: dodge.acceptedAction === "DODGE" && dodge.state.playerCombatState === "DODGING" && dodge.state.playerAnimation === "DODGE",
    readySpecialAccepted: specialReady.acceptedAction === "SPECIAL" && specialReady.state.playerAnimation === "SPECIAL" && specialReady.state.projectiles.length === 1,
    unreadySpecialRejected: specialNotReady.acceptedAction === null && specialNotReady.state.playerAnimation === "IDLE" && specialNotReady.state.projectiles.length === 0,
    unreadySpecialKeepsEnergyAndSignals: specialNotReady.state.specialEnergy === 40 && specialNotReady.metric.outcome === "charging",
    readySpecialHasNoNotReadySignal: specialReady.metric.outcome === "special-launched" && specialReady.state.specialEnergy === 0,
    rejectedDodgeHasNoCharacterAction: rejectedDodge.acceptedAction === null && rejectedDodge.state.playerAnimation === "IDLE",
  };
}

export function runActionVisualSyncTests() {
  const now = 30_000;
  const attack = applyPlayerAction(createBattle(1, now), { action: "ATTACK", timestampMs: now, source: "keyboard" }, [], () => 1).state;
  const dodge = applyPlayerAction(createBattle(1, now), { action: "DODGE", timestampMs: now, source: "keyboard" }, []).state;
  const special = applyPlayerAction({ ...createBattle(1, now), specialEnergy: 100 }, { action: "SPECIAL", timestampMs: now, source: "keyboard" }, []).state;
  const enemyAtImpact: BattleState = {
    ...createBattle(1, now),
    projectiles: [{ id: 1, owner: "ENEMY", sourceOwner: "ENEMY", status: "ENEMY_TRAVEL", spawnedAt: now - 500, impactAt: now, damage: 10 }],
    blockStartedAt: now - 100,
    blockUntil: now + 1_000,
    lastDefense: { action: "BLOCK", timestampMs: now - 100 },
  };
  const reflected = advanceOpponent(enemyAtImpact, now).state.projectiles.find((projectile) => projectile.reflected);
  return {
    attackTravelMatchesImpact: attack.projectiles[0]?.impactAt - attack.projectiles[0]?.spawnedAt === 500,
    dodgeVisualWindowIsLogicalWindow: dodge.animationResetAt === dodge.dodgeUntil && dodge.dodgeUntil - now === COMBAT_CONFIG.dodgeWindowMs,
    reflectionHasCatchAndTravel: Boolean(reflected && reflected.status === "SHIELD_CONTACT" && reflected.spawnedAt - now === 160 && reflected.impactAt - reflected.spawnedAt === 450),
    specialSpinPrecedesWave: special.projectiles[0]?.spawnedAt - now === 520,
    specialWaveMatchesImpact: special.projectiles[0]?.impactAt - special.projectiles[0]?.spawnedAt === 530,
    specialEnergyReset: special.specialEnergy === 0,
  };
}

export function runEnemyImpactRegressionTests() {
  const impactTime = 50_000;
  const projectile = (id: number, damage = 10): CombatProjectile => ({
    id,
    owner: "ENEMY",
    sourceOwner: "ENEMY",
    status: "ENEMY_TRAVEL",
    spawnedAt: impactTime - 500,
    impactAt: impactTime,
    damage,
  });
  const noDefense = advanceOpponent({ ...createBattle(1, 0), projectiles: [projectile(101)] }, impactTime);
  const dodge = applyPlayerAction(createBattle(1, 0), { action: "DODGE", timestampMs: impactTime - 100, source: "keyboard" }, []).state;
  const duringDodge = advanceOpponent({ ...dodge, projectiles: [projectile(102)] }, impactTime);
  const block = applyPlayerAction(createBattle(1, 0), { action: "BLOCK", timestampMs: impactTime - 100, source: "keyboard" }, []).state;
  const duringBlock = advanceOpponent({ ...block, projectiles: [projectile(103)] }, impactTime);
  const reflected = duringBlock.state.projectiles.find((item) => item.reflected);
  const reflectedImpact = reflected ? advanceOpponent(duringBlock.state, reflected.impactAt) : null;
  const expiredDodge = advanceOpponent({ ...dodge, dodgeUntil: impactTime - 100, projectiles: [projectile(104)] }, impactTime);
  const expiredBlock = advanceOpponent({ ...block, blockUntil: impactTime - 1, projectiles: [projectile(105)] }, impactTime);
  const processedOnce = advanceOpponent(noDefense.state, impactTime + 100);
  const defeat = advanceOpponent({ ...createBattle(4, 0), playerHealth: 10, projectiles: [projectile(106, 16)] }, impactTime);
  const bossDefeatable = COMBAT_CONFIG.opponentHealth.map((health, index) => {
    const battle = createBattle(index + 1, 0);
    const finishingShot: CombatProjectile = {
      id: 200 + index, owner: "PLAYER", sourceOwner: "PLAYER", status: "PLAYER_TRAVEL",
      spawnedAt: impactTime - 500, impactAt: impactTime, damage: health,
    };
    return advanceOpponent({ ...battle, projectiles: [finishingShot] }, impactTime).state.status === "won";
  });
  return {
    noDefenseLoses10: noDefense.state.playerHealth === 90 && noDefense.outcome === "hit",
    dodgeLoses0: duringDodge.state.playerHealth === 100 && duringDodge.outcome === "dodge",
    blockLoses0AndCreatesReflection: duringBlock.state.playerHealth === 100 && duringBlock.outcome === "block" && Boolean(reflected),
    blockDoesNotDamageBossAtCatch: duringBlock.state.opponentHealth === 90,
    reflectionDamagesBossAtImpact: reflectedImpact?.state.opponentHealth === 78,
    expiredDodgeTakesDamage: expiredDodge.state.playerHealth === 90,
    expiredBlockTakesDamage: expiredBlock.state.playerHealth === 90,
    duplicateImpactIgnored: processedOnce.state.playerHealth === 90,
    defeatAtZero: defeat.state.playerHealth === 0 && defeat.state.status === "lost",
    allBossesDefeatable: bossDefeatable.every(Boolean),
    passed: noDefense.state.playerHealth === 90 && duringDodge.state.playerHealth === 100 &&
      duringBlock.state.playerHealth === 100 && duringBlock.state.opponentHealth === 90 &&
      reflectedImpact?.state.opponentHealth === 78 && expiredDodge.state.playerHealth === 90 &&
      expiredBlock.state.playerHealth === 90 && processedOnce.state.playerHealth === 90 &&
      defeat.state.status === "lost" && bossDefeatable.every(Boolean),
  };
}

export function runCombatLoopRegressionTests() {
  const start = 80_000;
  const ready = { ...createBattle(1, start), nextOpponentDecisionAt: start };
  const telegraph = advanceOpponent(ready, start).state;
  const spawned = advanceOpponent(telegraph, telegraph.opponentAttackAt ?? start).state;
  const enemyShot = spawned.projectiles.find((projectile) => projectile.owner === "ENEMY");
  const midFlight = enemyShot ? advanceOpponent(spawned, enemyShot.spawnedAt + 250).state : spawned;
  const impact = enemyShot ? advanceOpponent(midFlight, enemyShot.impactAt) : { state: midFlight, outcome: null };

  const firstDodge = applyPlayerAction(
    { ...createBattle(1, start), nextOpponentDecisionAt: Infinity },
    { action: "ATTACK", timestampMs: start, source: "keyboard" },
    [],
    () => 0,
  ).state;
  const firstShot = firstDodge.projectiles.find((projectile) => projectile.owner === "PLAYER");
  const firstMiss = firstShot ? advanceOpponent(firstDodge, firstShot.impactAt).state : firstDodge;
  const cooldownAttack = applyPlayerAction(
    firstMiss,
    { action: "ATTACK", timestampMs: start + 1_000, source: "keyboard" },
    [],
    () => 0,
  ).state;
  const secondDodge = applyPlayerAction(
    { ...firstMiss, lastAttackAt: start, opponentAnimation: "IDLE" },
    { action: "ATTACK", timestampMs: start + OPPONENT_DODGE_COOLDOWN, source: "keyboard" },
    [],
    () => 0,
  ).state;
  const secondShot = secondDodge.projectiles.find((projectile) => projectile.id === start + OPPONENT_DODGE_COOLDOWN);
  const secondMiss = secondShot ? advanceOpponent(secondDodge, secondShot.impactAt).state : secondDodge;
  const forcedHit = applyPlayerAction(
    { ...secondMiss, lastAttackAt: start + OPPONENT_DODGE_COOLDOWN, opponentAnimation: "IDLE" },
    { action: "ATTACK", timestampMs: start + OPPONENT_DODGE_COOLDOWN * 2, source: "keyboard" },
    [],
    () => 0,
  ).state;
  const forcedShot = forcedHit.projectiles.find((projectile) => projectile.id === start + OPPONENT_DODGE_COOLDOWN * 2);
  const forcedImpact = forcedShot ? advanceOpponent(forcedHit, forcedShot.impactAt).state : forcedHit;

  const nextDelay = impact.state.nextOpponentDecisionAt - (enemyShot?.impactAt ?? start);
  return {
    telegraphHasNoProjectile: telegraph.projectiles.length === 0,
    oneProjectileDuringFlight: spawned.projectiles.filter((item) => item.owner === "ENEMY").length === 1 && midFlight.projectiles.filter((item) => item.owner === "ENEMY").length === 1,
    firstVisibleImpactDamagesOnce: impact.state.playerHealth === 90 && impact.state.projectiles.every((item) => item.id !== enemyShot?.id),
    nextAttackScheduledAfterImpact: nextDelay >= MIN_ATTACK_DELAY && nextDelay <= MAX_ATTACK_DELAY,
    forcedDodgeMissesVisibly: firstShot?.opponentDodged === true && firstDodge.opponentAnimation === "DODGE" && firstMiss.opponentHealth === 90,
    cooldownPreventsImmediateDodge: cooldownAttack.projectiles.some((item) => item.id === start + 1_000 && !item.opponentDodged),
    maximumTwoConsecutiveDodges: secondShot?.opponentDodged === true && forcedShot?.opponentDodged === false,
    hitResetsDodgeStreak: forcedImpact.opponentHealth === 75 && forcedImpact.consecutiveOpponentDodges === 0,
  };
}
