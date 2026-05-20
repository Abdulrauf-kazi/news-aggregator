import { StoryNode, StoryGraph, createStoryGraphFromStories } from "./graph";
import { SOURCE_DEFINITIONS, TOPICS } from "./sources";

const TITLES: Record<string, string[]> = {
  "AI": [
    "OpenAI Announces GPT-6 with Multi-Modal Reasoning Capabilities",
    "Google DeepMind Solves Protein Folding for Rare Tropical Diseases",
    "NVIDIA Launches Blackwell-2 Architecture for Massive LLM Scaling",
    "EU Parliament Passes Strict AI Act Amendments on Deepfakes",
    "Microsoft Integrates Copilot-X into Windows 12 Kernel",
    "Anthropic Releases Claude 4 with 2M Token Context Window",
    "AI-Generated Art Wins Prestigious Digital Gallery Award",
    "Tesla FSD v14 Achieves Level 4 Autonomy in San Francisco Tests",
    "Researchers Discover Efficient 4-Bit Quantization for Edge Devices",
    "MIT Developing Analog AI Chips Inspired by Human Brain Efficiency",
    "AI Startup 'NeuroStream' Raises $500M for Neural Interface Tech",
    "Global AI Safety Summit Establishes Permanent Monitoring Body",
    "AI Tools Predict Seismic Activity 48 Hours Before Earthquakes"
  ],
  "Macro": [
    "Federal Reserve Holds Rates Steady Amidst Mixed Inflation Data",
    "Goldman Sachs Forecasts 3.5% Global GDP Growth for 2027",
    "ECB Signals Possible Rate Cut as Eurozone Inflation Eases",
    "IMF Warns of Debt Vulnerabilities in Emerging Markets",
    "Oil Prices Surge Following Surprise OPEC+ Production Cut",
    "US Jobs Report Shows Surprising Resilience in Tech Sector",
    "China's Central Bank Injects Liquidity to Stabilize Property Market",
    "Gold Reaches All-Time High as Safe-Haven Demand Intensifies",
    "Yen Strengthens Against Dollar as BOJ Hints at Policy Shift",
    "World Bank Increases Climate Finance Commitments for Africa",
    "Bitcoin Hits New Peak as Institutional Adoption Accelerates",
    "UK Inflation Drops to 2-Year Low, Boosting Consumer Sentiment",
    "Supply Chain Bottlenecks Easing in Global Shipping Lanes"
  ],
  "Energy": [
    "Next-Gen Solar Cells Achieve 32% Efficiency in Lab Breakthrough",
    "UK Approves Massive Offshore Wind Farm in North Sea",
    "Modular Nuclear Reactors Gain Traction in US Industrial Hubs",
    "Solid-State Battery Breakthrough Doubles EV Range Potential",
    "Germany Achieves 65% Renewable Energy Share in Q1 2026",
    "Hydrogen-Powered Aircraft Completes First Transcontinental Flight",
    "Direct Air Capture Plant Opens in Iceland, Targeting 1M Tons CO2",
    "Researchers Find Vast Lithium Deposits in Salton Sea Region",
    "Fusion Energy Startup Claims Stable Plasma for 1 Hour",
    "Global Coal Demand Falls as Renewables Reach Price Parity",
    "Smart Grid Technology Reduces Urban Energy Waste by 15%",
    "Floating Solar Farms Deployed in Southeast Asian Reservoirs",
    "Recycled Battery Minerals Meet 20% of New Manufacturing Demand"
  ],
  "Geopolitics": [
    "New Trade Pact Signed Between ASEAN and European Union",
    "Diplomatic Breakthrough in Arctic Resource Sharing Talks",
    "UN Security Council Discusses Cyber Warfare Regulations",
    "India and Japan Strengthen Defense Cooperation in Indo-Pacific",
    "Migration Trends Shift as Climate-Impacted Regions Seek Aid",
    "South American Leaders Propose Unified Digital Currency",
    "African Union Launches Integrated Space Agency Operations",
    "Tensions Ease in Eastern Mediterranean Following Maritime Deal",
    "Global Treaty Proposed to Protect High Seas Biodiversity",
    "Central Asian Nations Sign Connectivity and Transit Agreement",
    "Nordic Countries Integrate Defense Procurement Systems",
    "Peace Talks Progress in Horn of Africa Conflict",
    "Small Island Nations Demand Stronger Climate Action at COP31"
  ],
  "Cyber": [
    "Major Ransomware Gang Disrupted by International Police Task Force",
    "Zero-Day Vulnerability in Linux Kernel Patched Globally",
    "Quantum-Resistant Encryption Standard Adopted by Major Banks",
    "Report Shows 40% Increase in Cloud Infrastructure Attacks",
    "New Malware 'ShadowStrike' Targeted Industrial Control Systems",
    "Apple Releases Critical Security Update for iOS 19",
    "Cyber Insurance Premiums Rise Amidst Systematic Risk Concerns",
    "Biometric Security Standards Updated for Financial Services",
    "Decentralized Identity Protocols Gaining Mainstream Adoption",
    "Cyberattack on Regional Power Grid Thwarted by AI Defense",
    "Privacy-Centric Browser Hits 100 Million Active Users",
    "Global Initiative Launched to Secure Open Source Software",
    "Satellite Internet Constellations Deploy End-to-End Encryption"
  ],
  "Climate": [
    "Ocean Surface Temperatures Hit Record High for Third Month",
    "Great Barrier Reef Shows Signs of Resilience in Targeted Restoration",
    "Amazon Rainforest Protection Efforts Slow Deforestation Rates",
    "Drought-Resistant Wheat Varieties Successfully Tested in Kenya",
    "Global Methane Emissions Tracking Satellite Goes Live",
    "EU Implements Carbon Border Adjustment Mechanism Phase 2",
    "Urban Heat Island Mitigation Project Launches in 50 Cities",
    "Coastal Cities Pilot Floating Infrastructure for Sea Level Rise",
    "New Bio-Plastic Degrades in Seawater Within 30 Days",
    "Vertical Farming Startup Scales Operations to 5 Countries",
    "Reforestation Project in Sahel Reaches 10 Million Trees",
    "Coral Nursery Technology Accelerates Reef Recovery",
    "Antarctic Ice Core Study Reveals 1M Year Climate History"
  ],
  "Defense": [
    "Supersonic Drone Interceptor Successfully Tested by NATO",
    "Space-Based Surveillance Network Enhances Global Monitoring",
    "New Stealth Destroyer Design Features Integrated Laser Defense",
    "Autonomous Underwater Vehicles Deployed for Pipeline Security",
    "Next-Gen Infantry Armor Incorporates Exoskeleton Support",
    "Joint Air Defense Exercise Conducted in Pacific Region",
    "Cyber Defense Command Established by EU Strategic Union",
    "Satellite Imagery Reveals New Underground Facility Construction",
    "Agreement Signed for Joint Development of 6th Gen Fighter",
    "Naval Mine Sweeping Tech Uses Cooperative Drone Swarms",
    "Quantum Sensors Detect Stealth Aircraft in Controlled Tests",
    "Electronic Warfare Suite Upgraded for Carrier Strike Groups",
    "Global Defense Spending Hits Record High Amidst Uncertainty"
  ],
  "Logistics": [
    "Autonomous Truck Convoy Completes 2000-Mile Delivery Route",
    "Hyperloop Pilot Project in UAE Begins Commercial Testing",
    "Smart Port Automation Increases Throughput by 25% in Rotterdam",
    "Drone Delivery Network Authorized for Medical Supplies in UK",
    "Supply Chain Visibility Platform Uses Blockchain Tracking",
    "World's Largest Electric Cargo Ship Enters Service",
    "Warehousing Robots Achieve Human-Level Dexterity in Trials",
    "New Rail Link Connects Southeast Asia to European Markets",
    "Logistics Hub in Panama Expansion Doubles Capacity",
    "Predictive Maintenance AI Reduces Fleet Downtime by 30%",
    "Sustainable Aviation Fuel (SAF) Production Scales Up",
    "Last-Mile Delivery Bots Deployed in 10 US Metropolitan Areas",
    "Intermodal Transport Efficiency Reaches Decade High"
  ]
};

const SUMMARIES: Record<string, string[]> = {
  "AI": [
    "The new model demonstrates unprecedented performance in complex logical reasoning tasks, surpassing previous benchmarks by 20%.",
    "Researchers utilized specialized algorithms to map protein structures in record time, potentially accelerating drug discovery.",
    "The architecture allows for 10x faster training of trillion-parameter models while reducing energy consumption.",
    "New regulations require clear labeling of all AI-generated content to prevent the spread of misinformation.",
    "The integration provides native AI capabilities for developers, enabling more intuitive user experiences."
  ],
  "Macro": [
    "The decision comes as inflation shows signs of stabilizing, though officials remain cautious about long-term trends.",
    "Strong consumer spending and infrastructure investment are cited as primary drivers for the optimistic forecast.",
    "Policy makers are monitoring labor market data closely before committing to further adjustments.",
    "Global financial stability remains a priority as interest rate environments shift across major economies.",
    "Energy markets continue to react to geopolitical shifts, influencing broader economic sentiment."
  ],
  "Energy": [
    "The breakthrough involves a new perovskite-silicon tandem structure that maximizes light absorption.",
    "When completed, the project will generate enough clean energy to power over 2 million homes.",
    "These reactors offer a safer and more flexible alternative to traditional large-scale nuclear plants.",
    "The technology eliminates liquid electrolytes, significantly reducing fire risks and increasing energy density.",
    "Solar and wind generation exceeded fossil fuels for the first time in the nation's history this quarter."
  ],
  "Geopolitics": [
    "The agreement aims to reduce tariffs and streamline regulatory standards across two major economic blocs.",
    "Parties agreed to a framework for scientific cooperation and environmental protection in the region.",
    "The discussions centered on establishing norms for state behavior in cyberspace and protecting critical infrastructure.",
    "Enhanced maritime patrols and intelligence sharing are key components of the new strategic partnership.",
    "Regional cooperation is seen as essential for managing the impacts of environmental and economic change."
  ],
  "Cyber": [
    "Operation 'NetSweep' involved cooperation between 15 different national law enforcement agencies.",
    "The vulnerability, which existed for over five years, allowed unauthorized access to system-level commands.",
    "The new standards are designed to remain secure even against future breakthroughs in quantum computing.",
    "Security experts emphasize the need for robust zero-trust architectures to protect sensitive data.",
    "Regular patching and employee training remain the most effective defenses against common attack vectors."
  ],
  "Climate": [
    "Scientists warn that persistent high temperatures could lead to more frequent and severe weather events.",
    "Innovative techniques like coral seeding and automated monitoring are showing promising results.",
    "Satellite data confirms a significant reduction in clearing activities within protected indigenous territories.",
    "The new crops require 30% less water while maintaining high yields in challenging environments.",
    "Global monitoring systems provide real-time data on greenhouse gas sources, enabling better policy enforcement."
  ],
  "Defense": [
    "The system uses advanced AI to track and neutralize high-speed incoming threats with millisecond precision.",
    "Enhanced resolution and frequent revisit rates provide unprecedented situational awareness.",
    "The platform integrates electromagnetic railguns and high-power lasers for short-range defense.",
    "Unmanned systems are increasingly used for persistent monitoring of sensitive maritime environments.",
    "Lightweight composite materials and integrated electronics provide enhanced protection and mobility."
  ],
  "Logistics": [
    "The vehicles utilize lidar and radar arrays to navigate complex highway environments safely without human input.",
    "The system aims to transport cargo at near-sonic speeds, potentially revolutionizing long-distance freight.",
    "Automated cranes and AI-driven traffic management have significantly reduced turnaround times.",
    "The service provides rapid transport of life-saving equipment to remote and hard-to-reach locations.",
    "Real-time tracking of every component in the supply chain reduces losses and improves inventory management."
  ]
};

const BODIES: Record<string, string[]> = {
  "AI": [
    `<p>The latest breakthrough in AI architecture has finally addressed the long-standing bottleneck of recursive reasoning. By implementing a new attention mechanism that weights logical consistency over pure pattern matching, researchers have achieved a significant jump in zero-shot performance on complex math and coding tasks.</p>
     <p>"We're seeing the emergence of true reasoning capabilities that don't just mimic training data," says Dr. Sarah Chen, lead researcher at the institute. "This isn't just a bigger model; it's a smarter one." The implications for software engineering and scientific research are profound, with early tests showing the model can debug complex distributed systems with 95% accuracy.</p>
     <p>Industry leaders are already reacting to the news. The new 'Thought-Chain' layer allows the model to verify its own output before presenting it to the user, effectively reducing hallucinations by over 80% compared to previous generations. This development is expected to accelerate the adoption of AI in mission-critical fields like aerospace and medicine.</p>
     <p>Furthermore, the compute efficiency has seen a 3x improvement, meaning these capabilities will soon be available on consumer-grade hardware. Experts predict that within the next 18 months, local reasoning models will become standard in personal computing devices, fundamentally changing how we interact with technology.</p>`,
    `<p>Healthcare technology reached a new milestone today with the release of the most comprehensive protein-folding database ever created for neglected tropical diseases. The project, which used over 50,000 GPUs for six months, has mapped the structures of thousands of proteins that were previously considered 'undruggable'.</p>
     <p>This data is now being released into the public domain, allowing researchers worldwide to begin designing targeted therapies for diseases that affect millions but receive little commercial funding. Early lab results suggest three new candidates for malaria treatment have already been identified using this dataset.</p>
     <p>The convergence of generative AI and molecular biology is creating a new era of 'precision medicine'. By simulating how billions of molecules interact with these protein structures in a virtual environment, the time required to move from discovery to clinical trials is being cut from years to mere weeks.</p>
     <p>Global health organizations have lauded the move, calling it a "game-changer for global equity." The open-source nature of the findings ensures that local research teams in impacted regions can leverage the high-end compute results without needing their own supercomputing clusters.</p>`
  ],
  "Macro": [
    `<p>Market volatility remained low today as investors parsed the latest data from the labor department and the central bank's summary of economic projections. While wage growth continues to outpace long-term averages, the core consumer price index has shown a consistent cooling trend over the last three quarters.</p>
     <p>Economists are now shifting their focus to the housing market, where limited supply continues to support prices despite higher borrowing costs. "The economy is showing remarkable resilience in the face of restrictive policy," noted one strategist. "We are seeing a rebalancing that many thought would require a significant downturn, yet employment remains robust."</p>
     <p>The treasury yield curve has begun to steepen, signaling that fixed-income investors are preparing for a sustained period of 'higher-for-longer' growth. Corporate earnings reports for the current quarter have also surprised to the upside, particularly in the infrastructure and energy sectors.</p>
     <p>Looking ahead, the international trade balance will be a key metric to watch. As global supply chains continue to reorganize around regional hubs, the flow of capital is creating new opportunities and risks in emerging markets that were previously overlooked by major institutional players.</p>`,
    `<p>Global trade patterns are undergoing a fundamental shift as 'friend-shoring' moves from theory to reality. Recent investment data shows a massive redirection of capital toward regional manufacturing hubs that offer both lower geopolitical risk and shorter supply chains. This transition is creating new economic powerhouses in Southeast Asia and Latin America.</p>
     <p>While this rebalancing increases supply chain resilience, some analysts warn it could lead to higher structural inflation in the medium term. "The peace dividend of the last three decades is being replaced by a resilience premium," says a leading trade economist. This means consumers may have to adjust to a new normal of slightly higher prices for goods that were once dirt cheap.</p>
     <p>The impact is particularly visible in the semiconductor and renewable energy industries. Major powers are competing to secure reliable sources of critical minerals, leading to a surge in bilateral agreements and strategic partnerships. This 'new mercantilism' is redefining the rules of global commerce.</p>
     <p>Despite these challenges, the digital services economy continues to grow at an exponential rate. Cross-border data flows are now more valuable than the trade in physical goods for many developed nations, providing a buffer against the friction being introduced into traditional manufacturing sectors.</p>`
  ],
  "Energy": [
    `<p>The commercial viability of fusion energy moved one step closer to reality this week with a sustained 60-minute plasma burn at the new pilot facility. Unlike previous experiments that required more energy than they produced, this run achieved a net gain factor that could realistically power a small city if scaled up.</p>
     <p>The achievement was made possible by a new superconducting magnet design that allows for higher containment pressures at lower operating temperatures. Industry leaders are now looking toward 2030 for the first grid-connected commercial plants, a timeline that was once thought impossible.</p>
     <p>"We have crossed the threshold from 'if' to 'when'," stated the facility's technical director. The next phase of development will focus on material durability, as the intense neutron flux within the reactor poses a significant engineering challenge for long-term operations.</p>
     <p>Private equity firms have already pledged over $10 billion in follow-on funding, sensing that the era of fossil fuels may finally be entering its sunset phase. The geopolitical implications of limitless, clean energy are staggering, potentially shifting the global balance of power away from traditional oil-producing states.</p>`,
    `<p>Next-generation battery technology is finally breaking the 'range anxiety' barrier for the average consumer. Solid-state prototypes have successfully completed 1,000 charge cycles with less than 1% degradation, while offering nearly double the energy density of current lithium-ion cells.</p>
     <p>Manufacturing experts suggest that as these batteries enter mass production, the cost of electric vehicles will drop below their internal combustion counterparts. This shift is expected to accelerate the decarbonization of the transport sector by several years, making the 2035 targets set by many governments highly achievable.</p>
     <p>The breakthrough lies in a proprietary ceramic electrolyte that is both non-flammable and highly conductive. This eliminates the safety risks associated with traditional batteries while allowing for much faster charging speeds—potentially adding 300 miles of range in under 10 minutes.</p>
     <p>Supply chain analysts are now scrambling to secure sources of the specific ceramic precursors needed for this technology. While lithium remains important, the reliance on cobalt and nickel is significantly reduced, offering a more ethically and environmentally sustainable path for the future of mobility.</p>`
  ],
  "Geopolitics": [
    `<p>The latest round of diplomatic talks has resulted in a historic framework for resource management in the high seas. The agreement, signed by over 140 nations, establishes clear rules for deep-sea mining, fishing rights, and environmental protection in areas beyond national jurisdiction.</p>
     <p>"This is a victory for multilateralism and for the health of our oceans," said the UN spokesperson. The treaty includes a benefit-sharing mechanism that ensures developing nations receive a portion of the revenues generated from high-seas resources, addressing a long-standing point of contention in international law.</p>
     <p>Enforcement remains the primary concern for many observers. The treaty relies on a combination of satellite surveillance and mandatory transponder data to monitor activity in remote areas. A new international tribunal has also been established to resolve disputes that may arise from overlapping claims.</p>
     <p>Despite the optimism, some industrial nations have expressed reservations about the strict environmental standards imposed by the agreement. The balance between economic development and ecological preservation will likely remain a source of tension as the implementation phase begins in the coming year.</p>`,
    `<p>Regional alliances are being redefined as nations seek to balance economic dependencies with security concerns. The new strategic partnership signed today includes not only traditional defense cooperation but also deep integration of critical mineral supply chains and semiconductor manufacturing standards.</p>
     <p>Observers note that this 'integrated security' approach reflects a broader trend where economic and national security are increasingly seen as two sides of the same coin. The move is expected to trigger similar alignment efforts among neighboring states, potentially leading to a more fragmented global order.</p>
     <p>The joint statement emphasized the need for "technological sovereignty" and the protection of intellectual property in dual-use sectors. By aligning their regulatory frameworks, the signatory nations hope to create a large enough internal market to compete with global superpowers without being forced into an exclusive alliance.</p>
     <p>This development is being closely watched by international organizations, who warn that the proliferation of such 'mini-lateral' agreements could undermine the stability of the global trading system. However, for the nations involved, the benefits of collective resilience far outweigh the risks of diplomatic friction.</p>`
  ],
  "Cyber": [
    `<p>A coordinated global law enforcement operation has successfully dismantled one of the most prolific ransomware-as-a-service networks in history. The operation involved seizing servers in six countries and arresting key developers who provided the technical infrastructure for hundreds of attacks on hospitals and schools.</p>
     <p>Security analysts say this move will significantly disrupt the cybercrime ecosystem in the short term, though they warn that new groups often emerge from the remnants of dismantled ones. "This is a major win, but the underlying economic incentives for these attacks haven't changed," noted a cybersecurity director.</p>
     <p>The evidence gathered during the raids has already led to dozens of follow-up investigations into money laundering networks used to process the ransom payments. The use of 'privacy coins' and complex tumbling services had previously made these financial flows difficult to track, but new analytical tools have provided a breakthrough.</p>
     <p>Governments are now being urged to use this momentum to pass stricter regulations on cyber-insurance and mandatory reporting requirements for ransomware incidents. Without a comprehensive approach that targets the financial infrastructure of cybercrime, the threat will likely remain a persistent feature of the digital landscape.</p>`,
    `<p>The transition to post-quantum cryptography has accelerated following the discovery of a new vulnerability in a widely used encryption standard. While the vulnerability was theoretical, it has prompted major financial institutions to pull forward their plans for implementing quantum-resistant protocols by at least two years.</p>
     <p>This massive infrastructure upgrade is being described as the 'Y2K of encryption'. It requires updating everything from browser security certificates to internal database encryption, creating a significant boom for specialized security consultancy firms and hardware manufacturers.</p>
     <p>"We are essentially rebuilding the foundations of digital trust," said one chief information security officer. The cost of the transition is expected to reach billions of dollars globally, but the risk of doing nothing is seen as far higher, given the rapid progress being made in quantum computing research.</p>
     <p>Standards bodies are working around the clock to finalize the approved algorithms for different use cases. The challenge lies in ensuring that the new protocols are not only secure against quantum attacks but also efficient enough to run on low-power devices like IoT sensors and mobile phones.</p>`
  ],
  "Climate": [
    `<p>A new study using high-resolution satellite imagery has confirmed that targeted reforestation efforts in the Sahel are successfully reversing desertification in key areas. The 'Great Green Wall' initiative is finally showing measurable impacts on local microclimates, with increased rainfall and improved soil moisture reported in regions where the tree cover has reached critical mass.</p>
     <p>Local communities are seeing the benefits through improved crop yields and the return of biodiversity. The project is now being used as a blueprint for similar large-scale restoration efforts in other arid regions of the world, including parts of the Middle East and Central Asia.</p>
     <p>The success is attributed to a shift in strategy from simple planting to a more holistic 'agro-forestry' approach that integrates native species and sustainable land management practices. This ensures that the restored areas are not only ecologically healthy but also provide economic value to the people living there.</p>
     <p>International climate funds have pledged additional support to scale the initiative to its original ambitious goals. The target is to restore 100 million hectares of degraded land by 2030, a feat that would sequester gigatons of carbon and provide a vital buffer against the impacts of a warming planet.</p>`,
    `<p>Urban cooling initiatives are moving beyond simple tree planting to include advanced material science. New 'cool-roof' coatings and phase-change building materials are being deployed across major metropolitan areas, successfully reducing average street-level temperatures by up to 3 degrees during peak heat waves.</p>
     <p>These interventions not only improve public health by reducing the incidence of heat-related illnesses but also significantly reduce the energy demand for air conditioning, creating a positive feedback loop for urban sustainability. City planners are now making these materials mandatory for all new construction.</p>
     <p>The economic benefits are also becoming clear. A recent analysis suggests that every dollar invested in urban cooling saves five dollars in health costs and energy expenses over a ten-year period. This 'resilience ROI' is driving a massive wave of public and private investment in sustainable infrastructure.</p>
     <p>Furthermore, the integration of vertical gardens and water-retention systems is helping cities manage the dual threats of extreme heat and flash flooding. These 'sponge city' designs represent the future of urban adaptation, where infrastructure works with nature rather than against it.</p>`
  ],
  "Defense": [
    `<p>The successful test of an autonomous maritime defense network has demonstrated a significant shift in naval warfare capabilities. The network, consisting of dozens of small, low-cost unmanned vessels, successfully coordinated a simulated defense of a carrier strike group against a high-volume saturation attack.</p>
     <p>Military analysts say this 'distributed lethality' approach makes it much harder for adversaries to target critical assets, as the defense is spread across many small platforms rather than a few large ones. The technology is expected to be fully operational within the next 24 months, fundamentally changing maritime strategy.</p>
     <p>The core of the system is an AI-driven 'swarm logic' that allows the vessels to make split-second decisions without direct human intervention. This significantly reduces the reaction time required to counter supersonic and hypersonic threats that can overwhelm traditional command-and-control structures.</p>
     <p>While the tactical advantages are clear, the development has raised important ethical questions about the use of autonomous weapons in international waters. Proponents argue that the system is purely defensive, but critics warn that the technology could easily be adapted for offensive operations, leading to a new and unpredictable era of conflict.</p>`,
    `<p>Next-generation surveillance satellites are now using quantum sensors to detect subtle anomalies in the Earth's magnetic field, allowing for the tracking of stealth aircraft and submerged submarines with unprecedented accuracy. This breakthrough effectively renders many current stealth technologies obsolete.</p>
     <p>The deployment of these sensors has triggered a new arms race in electronic warfare, as nations scramble to develop countermeasures that can spoof or jam quantum-based detection systems. The first operational constellation is expected to be in orbit by the end of the year, providing a level of situational awareness that was previously the stuff of science fiction.</p>
     <p>"The shadows have disappeared," noted a senior defense official. The ability to monitor every corner of the globe in real-time and across all spectra will have profound implications for deterrence and strategic stability. It may force a shift away from 'hidden' platforms toward those that rely on speed and sheer defensive capability.</p>
     <p>International observers are calling for a new round of arms control talks to address the destabilizing potential of these technologies. Without clear rules of the road, the risk of miscalculation or unintended escalation could increase as traditional 'safe havens' for strategic forces are compromised.</p>`
  ],
  "Logistics": [
    `<p>The full automation of the regional logistics hub has resulted in a 40% increase in throughput and a 20% reduction in operating costs. The facility now operates 24/7 with minimal human intervention, using a fleet of coordinated robots to manage everything from unloading shipping containers to final sorting for last-mile delivery.</p>
     <p>Industry experts say this represents the future of global trade, where 'dark warehouses' become the norm rather than the exception. The success of this pilot project has already led to plans for similar upgrades at three other major ports in the region, signaling a massive shift in how we move goods.</p>
     <p>The integration of predictive AI allows the hub to anticipate surges in demand and reconfigure its workflows in real-time. This has virtually eliminated the bottlenecks that have plagued the industry in recent years, ensuring that critical supplies reach their destinations with unprecedented reliability.</p>
     <p>The impact on the labor market is significant, with many traditional roles being replaced by technical positions focused on system maintenance and optimization. Governments are now being urged to invest in retraining programs to ensure that the workforce can adapt to this rapidly changing landscape.</p>`,
    `<p>Sustainable aviation fuel (SAF) has reached a critical price point, making it competitive with traditional jet fuel for the first time on certain routes. A combination of government subsidies and breakthroughs in carbon-capture-to-fuel technology has led to a massive increase in production capacity across the globe.</p>
     <p>Major airlines have responded by committing to use at least 20% SAF across their entire fleets by 2030. This shift is seen as the most viable path for the aviation industry to meet its net-zero targets without requiring a fundamental change in aircraft design or a significant reduction in air travel.</p>
     <p>The environmental impact is profound, with life-cycle emissions being reduced by up to 80% compared to conventional fuels. As the technology matures, researchers are looking toward even more advanced alternatives, including liquid hydrogen and high-energy-density solid-state batteries for short-haul flights.</p>
     <p>The transition is also creating a new economic opportunity for agricultural regions, where non-food crops can be grown to provide the feedstock for SAF production. This 'circular bio-economy' is attracting billions in investment and has the potential to revitalize rural areas while solving one of the hardest challenges of the green transition.</p>`
  ]
};

function generateRiggedStories(count: number): StoryNode[] {
  const stories: StoryNode[] = [];
  const sources = SOURCE_DEFINITIONS.map(s => s.id);
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const topic = TOPICS[i % TOPICS.length] as string;
    const titles = TITLES[topic] || [];
    const summaries = SUMMARIES[topic] || [];
    const bodies = BODIES[topic] || [];
    
    const title = titles[i % titles.length] || `Update on ${topic} Industry Trends`;
    const summary = summaries[i % summaries.length] || `Detailed analysis of recent developments in ${topic} shows significant movement in the sector. Experts suggest this could lead to long-term structural changes.`;
    const body = bodies[i % bodies.length] || `<p>${summary}</p><p>In a major development that experts are calling a "pivotal moment" for the industry, today's announcement regarding ${topic} has sent ripples through global markets. The implications of this ${title} are expected to be felt for months, if not years, to come.</p>`;
    
    // Mix sources
    const storySources = [
      sources[i % sources.length],
      sources[(i + 3) % sources.length],
      sources[(i + 7) % sources.length]
    ].filter((v, index, self) => self.indexOf(v) === index) as string[];

    // REALISTIC TIMESTAMPS: 
    // Start from 'now' and go back in random intervals of 8-15 minutes
    // This ensures every article has a unique, recent time.
    const timeOffsetMs = i * (8 + Math.random() * 7) * 60 * 1000;
    const timestamp = new Date(now - timeOffsetMs).toISOString();
    
    stories.push({
      id: `rigged-${i + 1}`,
      title,
      topic,
      score: 85 + (Math.sin(i) * 15),
      sourceIds: storySources,
      timestamp,
      url: `https://example.com/news/${i + 1}`,
      content: summary,
      // @ts-ignore - Custom field for our interceptor
      fullBody: body 
    });
  }
  
  return stories;
}

export const RIGGED_STORIES = generateRiggedStories(120);

export function getRiggedGraph(): StoryGraph {
  return createStoryGraphFromStories(RIGGED_STORIES);
}
