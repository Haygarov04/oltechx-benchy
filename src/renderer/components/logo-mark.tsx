const site = { name: "OLTechX" };

/** Пистите върху буквите. Същите координати се рисуват в двата цвята, виж по-долу. */
const TRACES = [
  "M264 250H300L348 295V341",
  "M141 348H172",
  "M132 382L150 396H178",
  "M422 393V440L438 460H482",
  "M391 481H490L510 460H556",
  "M763 276H710L680 295V363",
  "M682 381V400L692 420V471",
  "M718 290H750",
  "M836 336H815L800 345",
  "M740 411V435L755 462H818",
  "M1012 334H995L980 345",
  "M920 446L940 464H1013",
  "M1088 421V452L1065 484",
  "M1398 245L1350 300L1358 322",
  "M1464 288H1420L1392 325L1372 330",
  "M1340 352H1385L1395 368H1443",
  "M1318 452V420L1365 388H1395L1440 442H1468",
  "M1398 463L1362 418L1370 398",
];

const PADS: [number, number][] = [
  [255, 250], [348, 350], [132, 348],
  [422, 384], [382, 481], [565, 460],
  [772, 276], [682, 372], [692, 480],
  [845, 336], [740, 402], [827, 462],
  [1021, 334], [1022, 464],
  [1088, 412],
  [1406, 238], [1473, 288], [1452, 368], [1477, 442], [1405, 471], [1318, 461],
];

const LETTERS =
  // O
  "M243 212C318 212 378 275 378 352S318 492 243 492 108 429 108 352 168 212 243 212ZM243 267C200 267 166 305 166 352S200 437 243 437 320 399 320 352 286 267 243 267Z" +
  // L
  "M398 216H448V433H590V484H398Z" +
  // T
  "M550 216H790L750 264H668V430L640 484H618V264H507Z" +
  // e
  "M718 362Q718 312 768 312H880V414H762V430Q762 438 770 438H880L846 484H768Q718 484 718 436ZM772 352Q762 352 762 362V380H836V352Z" +
  // c
  "M898 362Q898 312 948 312H1046V356H952Q942 356 942 366V430Q942 438 950 438H1046V484H948Q898 484 898 436Z" +
  // h
  "M1065 258L1106 216V312H1170Q1218 312 1218 360V440L1178 480V370Q1178 354 1162 354H1106V484H1065Z" +
  // X
  "M1192 216H1258L1340 350L1250 492H1186L1290 350ZM1395 216H1452L1365 330H1330ZM1330 368H1362L1450 492H1395Z";

/**
 * Логото на OLTechX като вектор: букви с пътеки от платка.
 * Пистите се рисуват два пъти: със светлия цвят под буквите, за да личат извън тях,
 * и с цвета на фона върху буквите, за да изглеждат издълбани.
 */
export function LogoMark({
  className,
  color = "currentColor",
  background = "var(--background)",
}: {
  className?: string;
  color?: string;
  background?: string;
}) {
  const clipId = "oltechx-letters";
  const circuit = (
    <>
      {TRACES.map((d) => (
        <path key={d} d={d} fill="none" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {PADS.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={8.5} fill="none" strokeWidth={5} />
      ))}
    </>
  );

  return (
    <svg viewBox="100 205 1395 295" className={className} role="img" aria-label={site.name}>
      <defs>
        <clipPath id={clipId}>
          <path d={LETTERS} clipRule="evenodd" />
        </clipPath>
      </defs>
      <g stroke={color}>{circuit}</g>
      <path d={LETTERS} fill={color} fillRule="evenodd" />
      <g stroke={background} clipPath={`url(#${clipId})`}>
        {circuit}
      </g>
    </svg>
  );
}
