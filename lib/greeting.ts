export type GreetingKey = "greetingMorning" | "greetingAfternoon" | "greetingEvening";

export function getTimeOfDayGreeting(date: Date = new Date()): GreetingKey {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "greetingMorning";
  if (hour >= 12 && hour < 17) return "greetingAfternoon";
  // 17:00 - 04:59 wraps past midnight
  return "greetingEvening";
}
