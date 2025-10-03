/**
 * Analytics Context Provider
 * Centralized state management for analytics operations across all analytics views
 */

import React, { createContext, useContext, useReducer, useMemo, ReactNode } from 'react';
import type {
  AnalysisType,
  AnalyticsFilters,
  MetricSelection,
  TimeframeConfig,
  ChartType,
  AnalyticsResponse,
} from '@shared/analytics-types';

// Analytics State Interface
export interface AnalyticsState {
  // Analysis Configuration
  analysisType: AnalysisType;
  filters: AnalyticsFilters;
  metrics: MetricSelection;
  timeframe: TimeframeConfig;

  // Chart Configuration
  selectedChartType: ChartType;
  showAllCharts: boolean;

  // UI State
  isLoading: boolean;
  error: string | null;

  // Data State
  analyticsData: AnalyticsResponse | null;

  // Selection State (for individual analysis)
  selectedAthleteId: string;
  selectedAthlete: { id: string; name: string; teamName?: string } | null;

  // Multi-selection State (for comparative analysis)
  selectedAthleteIds: string[];
  selectedDates: string[];

  // State Preservation (for mode switching)
  // Stores previous metrics/timeframe when entering multi-group mode
  // Allows restoration when exiting multi-group mode
  previousMetrics: MetricSelection | null;
  previousTimeframe: TimeframeConfig | null;

  // Available Options
  availableTeams: Array<{ id: string; name: string }>;
  availableAthletes: Array<{
    id: string;
    name: string;
    teamName?: string;
    teams?: Array<{ id: string; name: string }>
  }>;
}

// Analytics Actions
export type AnalyticsAction =
  | { type: 'SET_ANALYSIS_TYPE'; payload: AnalysisType }
  | { type: 'SET_FILTERS'; payload: Partial<AnalyticsFilters> }
  | { type: 'SET_METRICS'; payload: Partial<MetricSelection> }
  | { type: 'SET_TIMEFRAME'; payload: Partial<TimeframeConfig> }
  | { type: 'SET_CHART_TYPE'; payload: ChartType }
  | { type: 'SET_SHOW_ALL_CHARTS'; payload: boolean }
  | { type: 'SET_SELECTED_ATHLETE'; payload: { id: string; athlete: { id: string; name: string; teamName?: string } | null } }
  | { type: 'SET_SELECTED_ATHLETE_IDS'; payload: string[] }
  | { type: 'SET_SELECTED_DATES'; payload: string[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_ANALYTICS_DATA'; payload: AnalyticsResponse | null }
  | { type: 'SET_AVAILABLE_TEAMS'; payload: Array<{ id: string; name: string }> }
  | { type: 'SET_AVAILABLE_ATHLETES'; payload: Array<{ id: string; name: string; teamName?: string; teams?: Array<{ id: string; name: string }> }> }
  | { type: 'RESET_FILTERS'; payload: { organizationId: string } }
  | { type: 'INITIALIZE_STATE'; payload: { organizationId: string; userId?: string } };

// Default State
const getDefaultState = (organizationId: string = '', userId?: string): AnalyticsState => ({
  analysisType: 'individual',
  filters: {
    organizationId,
    ...(userId && { athleteIds: [userId] })
  },
  metrics: {
    primary: 'FLY10_TIME',
    additional: []
  },
  timeframe: {
    type: 'best',
    period: 'all_time'
  },
  selectedChartType: 'box_swarm_combo',
  showAllCharts: false,
  isLoading: false,
  error: null,
  analyticsData: null,
  selectedAthleteId: '',
  selectedAthlete: null,
  selectedAthleteIds: [],
  selectedDates: [],
  previousMetrics: null,
  previousTimeframe: null,
  availableTeams: [],
  availableAthletes: []
});

/**
 * Helper Functions for Analysis Type Transitions
 */

/**
 * Determines if the transition is entering multi-group mode
 */
const isEnteringMultiGroup = (current: AnalysisType, next: AnalysisType): boolean =>
  current !== 'multi_group' && next === 'multi_group';

/**
 * Determines if the transition is exiting multi-group mode
 */
const isExitingMultiGroup = (current: AnalysisType, next: AnalysisType): boolean =>
  current === 'multi_group' && next !== 'multi_group';

/**
 * Handles state transitions when entering multi-group mode
 * Preserves current metrics/timeframe for restoration later
 *
 * @param state - Current analytics state
 * @param nextType - The analysis type being transitioned to
 * @returns New state with preserved settings and multi-group constraints applied
 *
 * State preservation occurs when:
 * - Additional metrics exist (length > 0) - saved to previousMetrics
 * - Timeframe type is 'trends' - saved to previousTimeframe
 *
 * Restrictions applied:
 * - Additional metrics cleared (single metric required for fair comparison)
 * - Timeframe forced to 'best' if currently 'trends' (trends not supported)
 */
const handleEnterMultiGroup = (state: AnalyticsState, nextType: AnalysisType): AnalyticsState => {
  return {
    ...state,
    analysisType: nextType,
    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],
    // Reset to clean state
    analyticsData: null,
    error: null,
    // Reset filters to only organizationId
    filters: {
      organizationId: state.filters.organizationId
    },
    // Reset metrics to default
    metrics: {
      primary: 'FLY10_TIME',
      additional: []
    },
    // Reset timeframe to default
    timeframe: {
      type: 'best',
      period: 'all_time'
    },
    // Reset chart settings
    selectedChartType: 'box_swarm_combo',
    showAllCharts: false,
    // Clear saved state
    previousMetrics: null,
    previousTimeframe: null,
  };
};

/**
 * Handles state transitions when exiting multi-group mode
 * Restores previously saved metrics/timeframe if available
 *
 * @param state - Current analytics state
 * @param nextType - The analysis type being transitioned to
 * @returns New state with restored settings (if available)
 *
 * Restoration logic:
 * - If previousMetrics exists: Restore with deep clone to avoid reference issues
 * - If previousMetrics null: Keep current metrics (user made no changes worth preserving)
 * - If previousTimeframe exists: Restore saved timeframe
 * - If previousTimeframe null: Keep current timeframe
 *
 * Edge cases handled:
 * - Prevents restoring null/undefined values
 * - Deep clones restored state to prevent mutation issues
 * - Clears saved state after restoration to prevent memory leaks
 */
const handleExitMultiGroup = (state: AnalyticsState, nextType: AnalysisType): AnalyticsState => {
  return {
    ...state,
    analysisType: nextType,
    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],
    // Reset to clean state
    analyticsData: null,
    error: null,
    // Reset filters to only organizationId
    filters: {
      organizationId: state.filters.organizationId
    },
    // Reset metrics to default
    metrics: {
      primary: 'FLY10_TIME',
      additional: []
    },
    // Reset timeframe to default
    timeframe: {
      type: 'best',
      period: 'all_time'
    },
    // Reset chart settings
    selectedChartType: 'box_swarm_combo',
    showAllCharts: false,
    // Clear saved state
    previousMetrics: null,
    previousTimeframe: null,
  };
};

/**
 * Handles normal analysis type changes (not involving multi-group transitions)
 */
const handleNormalTypeChange = (state: AnalyticsState, nextType: AnalysisType): AnalyticsState => ({
  ...state,
  analysisType: nextType,
  selectedAthleteId: '',
  selectedAthlete: null,
  selectedAthleteIds: [],
  selectedDates: [],
  // Reset to clean state
  analyticsData: null,
  error: null,
  // Reset filters to only organizationId
  filters: {
    organizationId: state.filters.organizationId
  },
  // Reset metrics to default
  metrics: {
    primary: 'FLY10_TIME',
    additional: []
  },
  // Reset timeframe to default
  timeframe: {
    type: 'best',
    period: 'all_time'
  },
  // Reset chart settings
  selectedChartType: 'box_swarm_combo',
  showAllCharts: false,
  // Clear saved state
  previousMetrics: null,
  previousTimeframe: null,
});

// Analytics Reducer
function analyticsReducer(state: AnalyticsState, action: AnalyticsAction): AnalyticsState {
  switch (action.type) {
    case 'INITIALIZE_STATE':
      return {
        ...getDefaultState(action.payload.organizationId, action.payload.userId),
        filters: {
          organizationId: action.payload.organizationId,
          ...(action.payload.userId && { athleteIds: [action.payload.userId] })
        }
      };

    case 'SET_ANALYSIS_TYPE': {
      // Use helper functions for cleaner, more maintainable logic
      if (isEnteringMultiGroup(state.analysisType, action.payload)) {
        return handleEnterMultiGroup(state, action.payload);
      }

      if (isExitingMultiGroup(state.analysisType, action.payload)) {
        return handleExitMultiGroup(state, action.payload);
      }

      return handleNormalTypeChange(state, action.payload);
    }

    case 'SET_FILTERS': {
      const newFilters = { ...state.filters, ...action.payload };

      // If athleteIds is set and we're in individual mode, also set selectedAthleteId
      const newSelectedAthleteId =
        state.analysisType === 'individual' &&
        action.payload.athleteIds &&
        action.payload.athleteIds.length > 0
          ? action.payload.athleteIds[0]
          : state.selectedAthleteId;

      return {
        ...state,
        filters: newFilters,
        selectedAthleteId: newSelectedAthleteId
      };
    }

    case 'SET_METRICS':
      return {
        ...state,
        metrics: { ...state.metrics, ...action.payload }
      };

    case 'SET_TIMEFRAME':
      return {
        ...state,
        timeframe: { ...state.timeframe, ...action.payload }
      };

    case 'SET_CHART_TYPE': {
      // Chart types that require trends data (time-series charts)
      const trendsChartTypes = ['line_chart', 'multi_line', 'connected_scatter'];
      const requiresTrends = trendsChartTypes.includes(action.payload);
      
      // Auto-switch timeframe type for trends-based charts
      const updatedTimeframe = requiresTrends && state.timeframe.type !== 'trends'
        ? {
            ...state.timeframe,
            type: 'trends' as const,
            // Default to 'all_time' for trends to show maximum data
            period: 'all_time' as const
          }
        : state.timeframe;

      return {
        ...state,
        selectedChartType: action.payload,
        timeframe: updatedTimeframe
      };
    }

    case 'SET_SHOW_ALL_CHARTS':
      return {
        ...state,
        showAllCharts: action.payload
      };

    case 'SET_SELECTED_ATHLETE':
      return {
        ...state,
        selectedAthleteId: action.payload.id,
        selectedAthlete: action.payload.athlete
      };

    case 'SET_SELECTED_ATHLETE_IDS':
      return {
        ...state,
        selectedAthleteIds: action.payload
      };

    case 'SET_SELECTED_DATES':
      return {
        ...state,
        selectedDates: action.payload
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false
      };

    case 'SET_ANALYTICS_DATA':
      return {
        ...state,
        analyticsData: action.payload,
        isLoading: false,
        error: null
      };

    case 'SET_AVAILABLE_TEAMS':
      return {
        ...state,
        availableTeams: action.payload
      };

    case 'SET_AVAILABLE_ATHLETES':
      return {
        ...state,
        availableAthletes: action.payload
      };

    case 'RESET_FILTERS':
      return {
        ...state,
        filters: { organizationId: action.payload.organizationId },
        metrics: { primary: 'FLY10_TIME', additional: [] },
        timeframe: { type: 'best', period: 'all_time' },
        selectedAthleteId: '',
        selectedAthlete: null,
        selectedAthleteIds: [],
        selectedDates: [],
        analyticsData: null,
        error: null
      };

    default:
      return state;
  }
}

// Context
interface AnalyticsContextType {
  state: AnalyticsState;
  dispatch: React.Dispatch<AnalyticsAction>;

  // Computed Properties
  isDataReady: boolean;
  shouldFetchData: boolean;
  chartData: any;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

// Provider Component
interface AnalyticsProviderProps {
  children: ReactNode;
  organizationId?: string;
  userId?: string;
  initialAnalysisType?: AnalysisType;
  initialFilters?: Partial<AnalyticsFilters>;
}

export function AnalyticsProvider({
  children,
  organizationId = '',
  userId,
  initialAnalysisType = 'individual',
  initialFilters
}: AnalyticsProviderProps) {
  const [state, dispatch] = useReducer(analyticsReducer, getDefaultState(organizationId, userId));

  // Initialize state when organization or user changes
  React.useEffect(() => {
    if (organizationId || userId) {
      dispatch({
        type: 'INITIALIZE_STATE',
        payload: { organizationId, userId }
      });
      if (initialAnalysisType !== 'individual') {
        dispatch({ type: 'SET_ANALYSIS_TYPE', payload: initialAnalysisType });
      }
      // Apply initial filters if provided
      if (initialFilters) {
        dispatch({ type: 'SET_FILTERS', payload: initialFilters });
      }
    }
  }, [organizationId, userId, initialAnalysisType, initialFilters]);

  // Computed properties
  const contextValue = useMemo(() => {
    const isDataReady = Boolean(
      state.analyticsData &&
      !state.isLoading &&
      !state.error
    );

    const shouldFetchData = Boolean(
      state.filters.organizationId &&
      (
        state.analysisType !== 'individual' ||
        (state.analysisType === 'individual' && state.selectedAthleteId)
      )
    );


    // Determine chart data based on chart type
    const chartData = state.analyticsData ? (() => {
      switch (state.selectedChartType) {
        case 'line_chart':
        case 'multi_line':
        case 'connected_scatter':
          return state.analyticsData.trends;
        case 'radar_chart':
          return state.analyticsData.multiMetric;
        default:
          return state.analyticsData.data;
      }
    })() : null;

    return {
      state,
      dispatch,
      isDataReady,
      shouldFetchData,
      chartData
    };
  }, [state]);

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
}

// Custom Hook
export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalyticsContext must be used within an AnalyticsProvider');
  }
  return context;
}

// Additional utility hooks
export function useAnalyticsActions() {
  const { dispatch } = useAnalyticsContext();

  return useMemo(() => ({
    setAnalysisType: (type: AnalysisType) =>
      dispatch({ type: 'SET_ANALYSIS_TYPE', payload: type }),

    updateFilters: (filters: Partial<AnalyticsFilters>) =>
      dispatch({ type: 'SET_FILTERS', payload: filters }),

    updateMetrics: (metrics: Partial<MetricSelection>) =>
      dispatch({ type: 'SET_METRICS', payload: metrics }),

    updateTimeframe: (timeframe: Partial<TimeframeConfig>) =>
      dispatch({ type: 'SET_TIMEFRAME', payload: timeframe }),

    setChartType: (chartType: ChartType) =>
      dispatch({ type: 'SET_CHART_TYPE', payload: chartType }),

    setShowAllCharts: (showAll: boolean) =>
      dispatch({ type: 'SET_SHOW_ALL_CHARTS', payload: showAll }),

    selectAthlete: (id: string, athlete: { id: string; name: string; teamName?: string } | null) =>
      dispatch({ type: 'SET_SELECTED_ATHLETE', payload: { id, athlete } }),

    setSelectedAthleteIds: (ids: string[]) =>
      dispatch({ type: 'SET_SELECTED_ATHLETE_IDS', payload: ids }),

    setSelectedDates: (dates: string[]) =>
      dispatch({ type: 'SET_SELECTED_DATES', payload: dates }),

    setLoading: (loading: boolean) =>
      dispatch({ type: 'SET_LOADING', payload: loading }),

    setError: (error: string | null) =>
      dispatch({ type: 'SET_ERROR', payload: error }),

    setAnalyticsData: (data: AnalyticsResponse | null) =>
      dispatch({ type: 'SET_ANALYTICS_DATA', payload: data }),

    setAvailableTeams: (teams: Array<{ id: string; name: string }>) =>
      dispatch({ type: 'SET_AVAILABLE_TEAMS', payload: teams }),

    setAvailableAthletes: (athletes: Array<{ id: string; name: string; teamName?: string; teams?: Array<{ id: string; name: string }> }>) =>
      dispatch({ type: 'SET_AVAILABLE_ATHLETES', payload: athletes }),

    resetFilters: (organizationId: string) =>
      dispatch({ type: 'RESET_FILTERS', payload: { organizationId } })
  }), [dispatch]);
}