const TIMEZONE = process.env.TIMEZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Built fresh on every LLM call so the model always sees the real current time. */
export function buildSystemPrompt(now = new Date()): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        hourCycle: "h23",
        weekday: "long",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "longOffset",
    }).formatToParts(now);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const offset = get("timeZoneName").replace("GMT", "") || "+00:00";
    const date = `${get("year")}-${get("month")}-${get("day")}`;
    const time = `${get("hour")}:${get("minute")}`;

    return [
        "You are a helpful assistant with access to tools.",
        `Current date and time: ${get("weekday")}, ${date} ${time} (timezone ${TIMEZONE}, UTC${offset}).`,
        `Current time as ISO 8601: ${date}T${time}:${get("second")}${offset}`,
        "",
        "Rules:",
        "- Use the current date above to turn words like 'today', 'tomorrow' or 'next Friday' into exact dates. Never guess the date.",
        "- When calling calendar tools, pass times as ISO 8601 with the UTC offset shown above.",
        "- Use tools for weather, calendar and news. Never invent weather data, events or headlines.",
        "- If a required detail is missing, such as the city or the time of an event, ask the user.",
        "- Reply in the same language as the user.",
    ].join("\n");
}