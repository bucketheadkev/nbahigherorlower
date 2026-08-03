'use client';

const STEPS = [
  {
    num: '01',
    title: 'Start low',
    desc: 'Begin with a D tier player and three lives.',
  },
  {
    num: '02',
    title: 'Trade up',
    desc: 'Accepted trades let you sell for credits or add to franchise.',
  },
  {
    num: '03',
    title: 'Build roster',
    desc: 'Assign players to your Starting Five and Bench.',
  },
  {
    num: '04',
    title: 'Upgrade',
    desc: 'Spend credits on better default starters in the store.',
  },
];

interface HomeHowItWorksProps {
  compact?: boolean;
}

export function HomeHowItWorks({ compact }: HomeHowItWorksProps) {
  return (
    <div className={`home-how${compact ? ' home-how--compact' : ''}`}>
      <span className="home-panel-label">How it works</span>
      <div className="home-how-grid">
        {STEPS.map((step) => (
          <div key={step.num} className="home-how-card">
            <span className="home-how-num">{step.num}</span>
            <h3 className="home-how-title">{step.title}</h3>
            <p className="home-how-desc">{step.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
