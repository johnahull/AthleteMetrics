/**
 * Analytics Context
 * Centralized state management for analytics functionality
 */

import React, { createContext, useContext, useReducer, useMemo, ReactNode } from 'react';
import type {
  AnalysisType,
  AnalyticsFilters,
  MetricSelection,
  TimeframeConfig,
  ChartType,
  AnalyticsResponse
} from '@shared/analytics-types';
import { useDataGrouping, type GroupingResult } from '@/hooks/useDataGrouping';

// State interface
export interface AnalyticsState {
  analysisType: AnalysisType;
  filters: AnalyticsFilters;
  metrics: MetricSelection;
  timeframe: TimeframeConfig;
  selectedChartType: ChartType;
  groupBy: string[];

  // Selection state
  selectedAthleteId: string;
  selectedAthlete: { id: string; name: string; teamName?: string } | null;
  selectedAthleteIds: string[];
  selectedDates: string[];

  // Data and UI state
  availableTeams: Array<{ id: string; name: string }>;
  availableAthletes: Array<{
    id: string;
    name: string;
    teamName?: string;
    teams?: Array<{ id: string; name: string }>;
  }>;

  analyticsData: AnalyticsResponse | null;
  isLoading: boolean;
  error: string | null;
}

// Action types
export type AnalyticsAction =
  | { type: 'SET_ANALYSIS_TYPE'; payload: AnalysisType }
  | { type: 'SET_FILTERS'; payload: Partial<AnalyticsFilters> }
  | { type: 'SET_METRICS'; payload: Partial<MetricSelection> }
  | { type: 'SET_TIMEFRAME'; payload: Partial<TimeframeConfig> }
  | { type: 'SET_CHART_TYPE'; payload: ChartType }
  | { type: 'SET_GROUPING'; payload: string[] }
  | { type: 'SET_SELECTED_ATHLETE'; payload: { id: string; athlete: { id: string; name: string; teamName?: string } | null } }
  | { type: 'SET_SELECTED_ATHLETE_IDS'; payload: string[] }
  | { type: 'SET_SELECTED_DATES'; payload: string[] }
  | { type: 'SET_AVAILABLE_TEAMS'; payload: Array<{ id: string; name: string }> }
  | { type: 'SET_AVAILABLE_ATHLETES'; payload: Array<{ id: string; name: string; teamName?: string; teams?: Array<{ id: string; name: string }> }> }
  | { type: 'SET_ANALYTICS_DATA'; payload: AnalyticsResponse | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'INITIALIZE_STATE'; payload: { organizationId?: string; userId?: string } }
  | { type: 'RESET_FILTERS'; payload: string };

// Default state generator
function getDefaultState(organizationId?: string, userId?: string): AnalyticsState {
  return {
    analysisType: 'individual',
    filters: { organizationId: organizationId || '' },
    metrics: { primary: 'FLY10_TIME', additional: [] },
    timeframe: { type: 'best', period: 'all_time' },
    selectedChartType: 'box_swarm_combo',
    groupBy: [],

    selectedAthleteId: '',
    selectedAthlete: null,
    selectedAthleteIds: [],
    selectedDates: [],

    availableTeams: [],
    availableAthletes: [],

    analyticsData: null,
    isLoading: false,
    error: null
  };
}

// Reducer
function analyticsReducer(state: AnalyticsState, action: AnalyticsAction): AnalyticsState {
  switch (action.type) {
    case 'SET_ANALYSIS_TYPE':
      return {
        ...state,
        analysisType: action.payload,
        // Reset athlete selection when switching types
        selectedAthleteId: action.payload !== 'individual' ? '' : state.selectedAthleteId,
        selectedAthlete: action.payload !== 'individual' ? null : state.selectedAthlete,
        selectedAthleteIds: action.payload === 'intra_group' ? state.selectedAthleteIds : [],
        selectedDates: []
      };

    case 'SET_FILTERS':
      return {
        ...state,
        filters: { ...state.filters, ...action.payload }
      };

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

    case 'SET_CHART_TYPE':
      return {
        ...state,
        selectedChartType: action.payload
      };

    case 'SET_GROUPING':
      return {
        ...state,
        groupBy: action.payload
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

    case 'SET_ANALYTICS_DATA':
      return {
        ...state,
        analyticsData: action.payload
      };

    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload,
        error: action.payload ? null : state.error
      };

    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false
      };

    case 'INITIALIZE_STATE':
      return {
        ...getDefaultState(action.payload.organizationId, action.payload.userId),
        availableTeams: state.availableTeams,
        availableAthletes: state.availableAthletes
      };

    case 'RESET_FILTERS':
      return {
        ...state,
        filters: { organizationId: action.payload },
        metrics: { primary: 'FLY10_TIME', additional: [] },
        timeframe: { type: 'best', period: 'all_time' },
        selectedAthleteId: '',
        selectedAthlete: null,
        selectedAthleteIds: [],
        selectedDates: [],
        groupBy: [],
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
  groupingResult: GroupingResult;

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
}

export function AnalyticsProvider({
  children,
  organizationId = '',
  userId,
  initialAnalysisType = 'individual'
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
    }
  }, [organizationId, userId, initialAnalysisType]);

  // Use data grouping hook
  const groupingResult = useDataGrouping({
    data: state.analyticsData?.data || null,
    groupBy: state.groupBy,
    primaryMetric: state.metrics.primary
  });

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

    // Determine chart data based on chart type and grouping
    const chartData = state.analyticsData ? (() => {
      // If we have grouped data, use it for supported chart types
      if (groupingResult.isGrouped) {
        switch (state.selectedChartType) {
          case 'box_swarm_combo':
          case 'box_plot':
          case 'bar_chart':
          case 'distribution':
            return groupingResult.groupedData;
          default:
            // For other chart types, fall back to ungrouped data
            break;
        }
      }

      // Standard chart data selection
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
      groupingResult,
      isDataReady,
      shouldFetchData,
      chartData
    };
  }, [state, groupingResult]);

  return (
    <AnalyticsContext.Provider value={contextValue}>
      {children}
    </AnalyticsContext.Provider>
  );
}

// Hook to use the context
export function useAnalyticsContext() {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalyticsContext must be used within an AnalyticsProvider');
  }
  return context;
}