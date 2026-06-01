export interface AdminDashboardMock {
  source: string;
  session: {
    status: string;
    statusLabel: string;
    email: string;
    name: string;
    role: string;
  };
  system: {
    status: string;
    dataMode: string;
    supabase: string;
    localJson: string;
    apiConnection: string;
    lastSyncLabel: string;
    errors: number;
  };
  admin: {
    confirmedCards: number;
    pendingRequests: number;
    officialResultsLoaded: number;
    predictionsWithErrors: number;
    backupsAvailable: number;
    exportsCompleted: number;
    lastBackupLabel: string;
    lastResultsUpdateLabel: string;
    resultsSource: string;
  };
  activityLog: Array<{
    date: string;
    time: string;
    event: string;
    user: string;
  }>;
}

export interface AdminPlayer {
  id: string;
  name: string;
}

export interface AdminFixtureMatch {
  id: string;
}

export interface AdminDashboardViewModel {
  session: AdminDashboardMock["session"];
  system: AdminDashboardMock["system"];
  activityLog: AdminDashboardMock["activityLog"];
  kpis: {
    registeredPlayers: number;
    confirmedCards: number;
    totalCards: number;
    loadedPredictions: number;
    pendingRequests: number;
    officialResultsLoaded: number;
    totalMatches: number;
    systemStatus: string;
  };
  players: {
    chips: string[];
    totalRegistered: number;
    confirmed: number;
    pending: number;
    incomplete: number;
  };
  predictions: {
    availableMatches: number;
    confirmedCards: number;
    incompleteCards: number;
    withErrors: number;
    totalPredictions: number;
  };
  officialResults: {
    loaded: number;
    pending: number;
    lastUpdateLabel: string;
    source: string;
  };
  backup: {
    lastBackupLabel: string;
    backupsAvailable: number;
    exportsCompleted: number;
  };
}

export function buildAdminDashboardViewModel(
  players: AdminPlayer[],
  matches: AdminFixtureMatch[],
  mock: AdminDashboardMock
): AdminDashboardViewModel {
  const registeredPlayers = players.length;
  const totalMatches = matches.length;
  const confirmedCards = Math.min(mock.admin.confirmedCards, registeredPlayers);
  const pendingCards = Math.max(registeredPlayers - confirmedCards, 0);
  const totalPredictions = registeredPlayers * totalMatches;
  const loadedResults = Math.min(mock.admin.officialResultsLoaded, totalMatches);

  return {
    session: mock.session,
    system: mock.system,
    activityLog: mock.activityLog,
    kpis: {
      registeredPlayers,
      confirmedCards,
      totalCards: registeredPlayers,
      loadedPredictions: 0,
      pendingRequests: mock.admin.pendingRequests,
      officialResultsLoaded: loadedResults,
      totalMatches,
      systemStatus: mock.system.status,
    },
    players: {
      chips: players.slice(0, 8).map((player) => player.name.slice(0, 2).toUpperCase()),
      totalRegistered: registeredPlayers,
      confirmed: confirmedCards,
      pending: pendingCards,
      incomplete: pendingCards,
    },
    predictions: {
      availableMatches: totalMatches,
      confirmedCards,
      incompleteCards: pendingCards,
      withErrors: mock.admin.predictionsWithErrors,
      totalPredictions,
    },
    officialResults: {
      loaded: loadedResults,
      pending: Math.max(totalMatches - loadedResults, 0),
      lastUpdateLabel: mock.admin.lastResultsUpdateLabel,
      source: mock.admin.resultsSource,
    },
    backup: {
      lastBackupLabel: mock.admin.lastBackupLabel,
      backupsAvailable: mock.admin.backupsAvailable,
      exportsCompleted: mock.admin.exportsCompleted,
    },
  };
}
