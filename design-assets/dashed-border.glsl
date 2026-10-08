precision mediump float;

/** @resolution */
uniform vec2 u_resolution;

/**
 * @label Color
 * @color
 * @default #3DDC97
 */
uniform vec4 u_color;

/**
 * @label Corner radius
 * @default 12
 * @range 0, 64
 */
uniform float u_radius;

/**
 * @label Stroke width
 * @default 1.5
 * @range 0.5, 8
 */
uniform float u_width;

/**
 * @label Dash length
 * @default 8
 * @range 1, 40
 */
uniform float u_dash;

/**
 * @label Gap length
 * @default 6
 * @range 1, 40
 */
uniform float u_gap;

void main() {
  vec2 half_size = u_resolution * 0.5;
  vec2 p = abs(gl_FragCoord.xy - half_size);
  float r = min(u_radius, min(half_size.x, half_size.y));
  vec2 q = p - (half_size - vec2(r));
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;

  float inner = smoothstep(-u_width - 0.75, -u_width + 0.75, d);
  float outer = 1.0 - smoothstep(-0.75, 0.0, d);
  float band = inner * outer;

  float hx = half_size.x - r;
  float hy = half_size.y - r;
  float arc = 1.5707963 * r;
  float s;
  if (q.x > 0.0 && q.y > 0.0) {
    s = hx + r * atan(q.x, q.y);
  } else if (q.y >= q.x) {
    s = p.x;
  } else {
    s = hx + arc + (hy - p.y);
  }
  float total = hx + hy + arc;
  float period = total / max(1.0, floor(total / (u_dash + u_gap) + 0.5));
  float frac = u_dash / (u_dash + u_gap);
  float on = step(fract(s / period + frac * 0.5), frac);

  float a = band * on * u_color.a;
  gl_FragColor = vec4(u_color.rgb * a, a);
}
