// Palette for event colors. A new event gets a random one so the timeline
// isn't monochrome.
export const EVENT_COLORS = [
  '#4f8cff', '#a55eea', '#ff9f43', '#26de81', '#fc5c65',
  '#4b7bec', '#20bf6b', '#fd9644', '#f7b731', '#eb3b5a',
  '#2bcbba', '#45aaf2', '#fed330', '#fa8231', '#8854d0'
];

export function randomColor() {
  return EVENT_COLORS[Math.floor(Math.random() * EVENT_COLORS.length)];
}
