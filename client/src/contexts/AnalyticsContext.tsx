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

  // Available Options
  availableTeams: Array<{ id: string; name: string }>;
  availableAthletes: Array<{
    id: string;
    name: string;
    teamName?: string;
    teams?: Array<{ id: string; name: string }>
  }>;

  // Metrics Availability
  metricsAvailability: Record<string, number>;
  maxMetricCount?: number;
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
  availableTeams: [],
  availableAthletes: [],
  metricsAvailability: {}
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
 * Preserves compatible settings while clearing incompatible ones
 *
 * @param state - Current analytics state
 * @param nextType - The analysis type being transitioned to
 * @returns New state with hybrid preservation/reset approach
 *
 * Preservation logic:
 * - Preserves: primary metric, chart type, timeframe (unless 'trends')
 * - Preserves compatible filters: organizationId, genders, birthYearFrom, birthYearTo
 * - Clears incompatible filters: athleteIds, teams (multi-group uses group selection)
 * - Clears additional metrics (multi-group only supports 1 metric)
 * - Resets 'trends' timeframe to 'best/all_time' (trends not supported in multi-group)
 */
const handleEnterMultiGroup = (state: AnalyticsState, nextType: AnalysisType): AnalyticsState => {
  return {
    ...state,
    analysisType: nextType,
    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],
    // Clear data and errors
    analyticsData: null,
    error: null,
    // Clear incompatible filters (athleteIds, teams), preserve compatible ones
    filters: {
      organizationId: state.filters.organizationId,
      ...(state.filters.genders && { genders: state.filters.genders }),
      ...(state.filters.birthYearFrom && { birthYearFrom: state.filters.birthYearFrom }),
      ...(state.filters.birthYearTo && { birthYearTo: state.filters.birthYearTo })
    },
    // Preserve primary metric, clear additional (multi-group only supports 1 metric)
    metrics: {
      primary: state.metrics.primary,
      additional: []
    },
    // Preserve timeframe unless it's trends (incompatible with multi-group)
    timeframe: state.timeframe.type === 'trends'
      ? { type: 'best', period: 'all_time' }
      : state.timeframe,
    // Preserve chart type if compatible, otherwise default to box_swarm_combo
    selectedChartType: state.selectedChartType,
    showAllCharts: false,
  };
};

/**
 * Handles state transitions when exiting multi-group mode
 * Preserves all current settings (no state restoration from previous mode)
 *
 * @param state - Current analytics state
 * @param nextType - The analysis type being transitioned to
 * @returns New state with all filters and settings preserved
 *
 * Preservation logic:
 * - Preserves all filters (organizationId, genders, birthYear ranges, etc.)
 * - Preserves primary metric (additional metrics already empty in multi-group)
 * - Preserves timeframe and chart type
 * - Resets athlete selections (different selection model between modes)
 * - Clears analytics data (will be refetched for new mode)
 */
const handleExitMultiGroup = (state: AnalyticsState, nextType: AnalysisType): AnalyticsState => {
  return {
    ...state,
    analysisType: nextType,
    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],
    // Clear data and errors
    analyticsData: null,
    error: null,
    // Preserve all filters (selection models handle athlete/team filtering separately)
    filters: state.filters,
    // Preserve metrics (primary carries over, additional was empty anyway)
    metrics: {
      primary: state.metrics.primary,
      additional: []
    },
    // Preserve timeframe
    timeframe: state.timeframe,
    // Preserve chart type
    selectedChartType: state.selectedChartType,
    showAllCharts: false,
  };
};

/**
 * Handles normal analysis type changes (not involving multi-group transitions)
 * Individual <-> Multi-athlete transitions preserve all settings (fully compatible)
 */
const handleNormalTypeChange = (state: AnalyticsState, nextType: AnalysisType): AnalyticsState => ({
  ...state,
  analysisType: nextType,
  // Reset athlete selections (different selection model)
  selectedAthleteId: '',
  selectedAthlete: null,
  selectedAthleteIds: [],
  selectedDates: [],
  // Clear data and errors
  analyticsData: null,
  error: null,
  // Preserve all filters (fully compatible between individual and multi-athlete)
  filters: state.filters,
  // Preserve all metrics (fully compatible between individual and multi-athlete)
  metrics: state.metrics,
  // Preserve timeframe
  timeframe: state.timeframe,
  // Preserve chart settings
  selectedChartType: state.selectedChartType,
  showAllCharts: state.showAllCharts,
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
        metricsAvailability: action.payload?.metricsAvailability || {},
        maxMetricCount: action.payload?.maxMetricCount,
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