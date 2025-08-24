/**
 * Calculate speed in miles per hour for fly 10 time
 * @param timeInSeconds - Fly 10 time in seconds
 * @returns Speed in mph rounded to 1 decimal place
 */
export function calculateFly10Speed(timeInSeconds: number): number {
  // 10 yards = 30 feet
  // Speed (mph) = (Distance in feet / Time in seconds) × (3600 seconds/hour) ÷ (5280 feet/mile)
  // For 10 yards: (30 feet / time) × 0.6818 = 20.45 / time
  const speedMph = 20.45 / timeInSeconds;
  return Math.round(speedMph * 10) / 10; // Round to 1 decimal place
}

/**
 * Format fly 10 time with speed
 * @param timeInSeconds - Fly 10 time in seconds
 * @returns Formatted string with time and speed
 */
export function formatFly10TimeWithSpeed(timeInSeconds: number): string {
  const speed = calculateFly10Speed(timeInSeconds);
  return `${timeInSeconds}s (${speed} mph)`;
}