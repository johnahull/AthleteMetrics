// Utility functions for measurement metrics
import { Clock, ArrowUp, Zap, Move, Timer, TrendingUp, Gauge } from "lucide-react";
import { formatFly10TimeWithSpeed } from "@/lib/speed-utils";

export function getMetricDisplayName(metric: string): string {
  switch (metric) {
    case "FLY10_TIME":
      return "Fly-10";
    case "VERTICAL_JUMP":
      return "Vertical Jump";
    case "AGILITY_505":
      return "5-0-5";
    case "AGILITY_5105":
      return "5-10-5";
    case "T_TEST":
      return "T-Test";
    case "DASH_40YD":
      return "40yd Dash";
    case "RSI":
      return "RSI";
    case "TOP_SPEED":
      return "Top Speed";
    default:
      return metric;
  }
}

export function getMetricBadgeVariant(metric: string): "default" | "secondary" | "destructive" | "outline" {
  switch (metric) {
    case "FLY10_TIME":
      return "default";
    case "VERTICAL_JUMP":
      return "secondary";
    case "AGILITY_505":
    case "AGILITY_5105":
      return "outline";
    case "T_TEST":
      return "destructive";
    case "DASH_40YD":
      return "default";
    case "RSI":
      return "outline";
    case "TOP_SPEED":
      return "default";
    default:
      return "secondary";
  }
}

export function getMetricColor(metric: string): string {
  switch (metric) {
    case "FLY10_TIME":
      return "bg-blue-100 text-blue-800";
    case "VERTICAL_JUMP":
      return "bg-purple-100 text-purple-800";
    case "AGILITY_505":
      return "bg-green-100 text-green-800";
    case "AGILITY_5105":
      return "bg-yellow-100 text-yellow-800";
    case "T_TEST":
      return "bg-red-100 text-red-800";
    case "DASH_40YD":
      return "bg-indigo-100 text-indigo-800";
    case "RSI":
      return "bg-orange-100 text-orange-800";
    case "TOP_SPEED":
      return "bg-teal-100 text-teal-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export function getMetricUnits(metric: string): string {
  switch (metric) {
    case "FLY10_TIME":
    case "AGILITY_505":
    case "AGILITY_5105":
    case "T_TEST":
    case "DASH_40YD":
      return "s";
    case "VERTICAL_JUMP":
      return "in";
    case "RSI":
      return "";
    case "TOP_SPEED":
      return "mph";
    default:
      return "";
  }
}

export function getMetricIcon(metric: string) {
  switch (metric) {
    case "FLY10_TIME":
      return Clock;
    case "VERTICAL_JUMP":
      return ArrowUp;
    case "AGILITY_505":
    case "AGILITY_5105":
      return Zap;
    case "T_TEST":
      return Move;
    case "DASH_40YD":
      return Timer;
    case "RSI":
      return TrendingUp;
    case "TOP_SPEED":
      return Gauge;
    default:
      return Clock;
  }
}

export function formatMetricValue(metric: string, value: number): string {
  switch (metric) {
    case "FLY10_TIME":
      return formatFly10TimeWithSpeed(value);
    case "VERTICAL_JUMP":
      return `${value}in`;
    case "RSI":
      return `${value}`;
    case "TOP_SPEED":
      return `${value} mph`;
    default:
      return `${value}s`;
  }
}