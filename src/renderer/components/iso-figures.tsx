import { Box, Fan, Figure, Grid, Move, Plate, Quad, Surface } from "./iso";

/** The hardware figures from oltechx.com: each one is the real thing and comes apart when it is live. */

export function Gpu() {
  return (
    <Figure>
      <g transform="translate(0 6)">
        <Box at={[-38, -15, -12]} size={[2, 30, 20]} tone="metal" />
        <Box at={[-34, -15, -8]} size={[70, 30, 2]} tone="dark" />
        <Box at={[-22, 15, -9]} size={[36, 1.5, 3]} tone="gold" />
        <Move by={[0, 0, 8]}>
          <Box at={[-34, -15, -6]} size={[70, 30, 12]} />
          <Fan center={[-15, 0, 6]} r={12.5} plane="z" blades={9} />
          <Fan center={[15, 0, 6]} r={12.5} plane="z" blades={9} reverse />
          <Box at={[-34, 15, -2]} size={[70, 0.5, 3]} tone="accent" />
        </Move>
      </g>
    </Figure>
  );
}

export function Cpu() {
  return (
    <Figure>
      <g transform="translate(0 8)">
        <Box at={[-27, -27, -10]} size={[54, 54, 4]} tone="dark" />
        <Grid center={[0, 0, -5.9]} w={40} d={40} cols={14} rows={14} className="iso-grid iso-grid-gold" />
        <Move by={[0, 0, 24]}>
          <Box at={[-20, -20, -6]} size={[40, 40, 2]} tone="accent" />
          <Box at={[-15, -15, -4]} size={[30, 30, 3.5]} tone="metal" />
        </Move>
      </g>
    </Figure>
  );
}

export function Motherboard() {
  return (
    <Figure>
      <g transform="translate(0 6)">
        <Box at={[-38, -38, -8]} size={[76, 76, 2.5]} tone="dark" />
        <Move by={[0, 0, 8]}>
          <Box at={[-32, -32, -5.5]} size={[9, 26, 8]} tone="metal" />
        </Move>
        <Move by={[0, 0, 11]} delay={60}>
          <Box at={[-19, -20, -5.5]} size={[22, 22, 2.5]} tone="metal" />
        </Move>
        {[10, 16, 22, 28].map((x, i) => (
          <Move key={x} by={[0, 0, 8]} delay={120 + i * 40}>
            <Box at={[x, -32, -5.5]} size={[3, 34, 3]} tone="accent" />
          </Move>
        ))}
        <Move by={[0, 0, 7]} delay={280}>
          <Box at={[-30, 8, -5.5]} size={[38, 4, 2.5]} tone="gold" />
        </Move>
        <Move by={[0, 0, 7]} delay={320}>
          <Box at={[-30, 20, -5.5]} size={[38, 3, 2]} tone="dark" />
        </Move>
        <Move by={[0, 0, 9]} delay={360}>
          <Box at={[14, 14, -5.5]} size={[18, 18, 4]} />
        </Move>
      </g>
    </Figure>
  );
}

export function Ram() {
  return (
    <Figure>
      <g transform="translate(-2 14)">
        <Box at={[-14, -32, -16]} size={[28, 64, 3]} tone="dark" />
        {[-10, 2].map((x, i) => (
          <Move key={x} by={[0, 0, 16]} delay={i * 90}>
            <Box at={[x, -29, -13]} size={[1.4, 58, 2.5]} tone="gold" />
            <Box at={[x - 0.8, -30, -10.5]} size={[3, 60, 20]} />
            <Box at={[x - 0.8, -30, 9.5]} size={[3, 60, 2]} tone="accent" />
          </Move>
        ))}
      </g>
    </Figure>
  );
}

export function Storage() {
  return (
    <Figure>
      <g transform="translate(-4 5)">
        <Box at={[-17, -42, -8]} size={[34, 12, 5]} tone="dark" />
        <Box at={[-11, -36, -6]} size={[22, 6, 1.2]} tone="gold" />
        <Move by={[0, 14, 0]}>
          <Box at={[-13, -31, -6]} size={[26, 64, 1.5]} tone="dark" />
          <Box at={[-10, -23, -4.5]} size={[20, 15, 1.8]} tone="metal" />
          <Box at={[-10, -4, -4.5]} size={[20, 15, 1.8]} tone="metal" />
          <Box at={[-6, 15, -4.5]} size={[12, 10, 1.4]} tone="accent" />
        </Move>
      </g>
    </Figure>
  );
}

export function Desktop() {
  return (
    <Figure view="-78 -72 156 156">
      <g transform="translate(26 14)">
        <Box at={[-10, -12, -28]} size={[20, 20, 2]} tone="dark" />
        <Box at={[-2, -6, -26]} size={[4, 4, 12]} tone="dark" />
        <Box at={[-28, -4, -16]} size={[56, 3, 32]} tone="dark" />
        <Quad className="iso-screen" points={[[-26, -0.9, -14], [26, -0.9, -14], [26, -0.9, 14], [-26, -0.9, 14]]} />
      </g>
      <g transform="translate(-26 18)">
        <Box at={[-13, -22, -26]} size={[26, 44, 50]} tone="dark" />
        <Fan center={[13.2, 6, 12]} r={8} plane="x" />
        <Fan center={[13.2, 6, -6]} r={8} plane="x" reverse />
        <Box at={[13.2, -18, 4]} size={[0.5, 12, 14]} tone="accent" />
      </g>
    </Figure>
  );
}

export function Laptop() {
  return (
    <Figure>
      <g transform="translate(0 12)">
        <Quad className="iso-panel" points={[[-32, -22, -11], [32, -22, -11], [32, -29, 26], [-32, -29, 26]]} />
        <Quad className="iso-screen" points={[[-29.5, -22.5, -8], [29.5, -22.5, -8], [29.5, -28.5, 23.5], [-29.5, -28.5, 23.5]]} />
        <Box at={[-32, -22, -14]} size={[64, 44, 3]} />
        <Surface center={[0, -7, -10.9]} w={54} d={20} r={1} className="iso-keys" />
        <Grid center={[0, -7, -10.8]} w={54} d={20} cols={14} rows={5} className="iso-grid iso-grid-keys" />
        <Surface center={[0, 12, -10.9]} w={20} d={14} r={1.5} className="iso-pad" />
      </g>
    </Figure>
  );
}

export function MiniPc() {
  return (
    <Figure>
      <g transform="translate(0 8)">
        <Plate center={[0, 0, -12]} size={[52, 52, 14]} r={9} tone="metal" />
        <Fan center={[0, 0, 2.2]} r={17} plane="z" blades={11} />
        <Surface center={[-10, 26.1, -5]} w={7} d={3.4} r={0.6} plane="y" className="iso-port" />
        <Surface center={[0, 26.1, -5]} w={7} d={3.4} r={0.6} plane="y" className="iso-port" />
        <Surface center={[12, 26.1, -5]} w={3} d={3} r={1.5} plane="y" className="iso-accent-fill iso-blinker" />
      </g>
    </Figure>
  );
}

export function Phone() {
  return (
    <Figure>
      <g transform="translate(0 4)">
        <Move by={[0, 0, 9]}>
          <Plate center={[0, 0, -8]} size={[30, 60, 3.5]} r={6} tone="dark" />
          <Surface center={[0, 0, -4.4]} w={26.5} d={56} r={4.5} className="iso-screen" />
          <Surface center={[0, -23.5, -4.3]} w={9} d={2.4} r={1.2} className="iso-port" />
          <Box at={[15, -10, -7.4]} size={[0.8, 9, 1.6]} tone="metal" />
        </Move>
      </g>
    </Figure>
  );
}

export function Tablet() {
  return (
    <Figure>
      <g transform="translate(-4 4)">
        <Plate center={[0, 0, -8]} size={[48, 66, 2.6]} r={5} tone="dark" />
        <Surface center={[0, 0, -5.3]} w={44} d={62} r={3.5} className="iso-screen" />
        <Move by={[0, 0, 6]}>
          <Box at={[29, -26, -8]} size={[2.4, 50, 2.4]} tone="base" />
        </Move>
      </g>
    </Figure>
  );
}

export function AllInOne() {
  return (
    <Figure>
      <g transform="translate(0 14)">
        <Box at={[-16, -12, -28]} size={[32, 22, 2]} tone="metal" />
        <Box at={[-4, -9, -26]} size={[8, 4, 18]} tone="metal" />
        <Box at={[-40, -6, -14]} size={[80, 6, 50]} tone="metal" />
        <Quad className="iso-screen" points={[[-37, 0.1, -3], [37, 0.1, -3], [37, 0.1, 33], [-37, 0.1, 33]]} />
        <Surface center={[0, 0.1, 34.4]} w={1.6} d={1.6} r={0.8} plane="y" className="iso-port" />
        <Move by={[0, 10, 0]}>
          <Box at={[-26, 12, -28]} size={[52, 16, 1.6]} tone="base" />
          <Grid center={[0, 20, -26.3]} w={48} d={12} cols={14} rows={4} className="iso-grid-keys" />
        </Move>
      </g>
    </Figure>
  );
}

export function PowerBank() {
  return (
    <Figure>
      <g transform="translate(0 8)">
        <Plate center={[0, 0, -12]} size={[36, 64, 12]} r={7} tone="metal" />
        {[-6, -1, 4, 9].map((y, i) => (
          <Surface key={y} center={[8, y, 0.1]} w={2.4} d={2.4} r={1.2} className={i < 3 ? "iso-accent-fill" : "iso-port"} />
        ))}
        <Surface center={[0, 32.1, -6]} w={9} d={3} r={1.4} plane="y" className="iso-port" />
        <Move by={[0, 8, 0]}>
          <Box at={[-2, 40, -8]} size={[4, 18, 3]} tone="dark" />
          <Box at={[-3, 36, -8.5]} size={[6, 5, 4]} tone="metal" />
        </Move>
      </g>
    </Figure>
  );
}
