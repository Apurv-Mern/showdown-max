'use strict';

const QUESTIONS_PER_ROUND = 10;
const QUESTIONS_PER_ROUND_BY_TYPE = {
  FINAL_WAGER: 1,
};

const QUIZ_TITLE_PREFIX = 'Auto Generated Quiz';

const QUIZ_DEFINITIONS = [
  {
    code: 1,
    title: 'Global Mix Challenge',
    description: 'A balanced all-rounder quiz across GK, music, wagering, and finals.',
  },
  {
    code: 2,
    title: 'Tech & Pop Culture Showdown',
    description: 'Technology, media, and modern culture focused showdown set.',
  },
  {
    code: 3,
    title: 'Science & Logic Arena',
    description: 'Science-forward quiz with logical and analytical question themes.',
  },
  {
    code: 4,
    title: 'Sports, Movies & Trends',
    description: 'Fast-paced mix of sports, film, and popular trend knowledge.',
  },
  {
    code: 5,
    title: 'Ultimate Finals Edition',
    description: 'High-stakes ladder with strong elimination and final wager pacing.',
  },
];

const ROUND_BLUEPRINT = [
  { name: 'Round 1 - Multiple Choice', type: 'MULTIPLE_CHOICE', timerDuration: 30 },
  { name: 'Round 2 - Wager', type: 'WAGER', timerDuration: 30 },
  { name: 'Round 3 - Music', type: 'MUSIC', timerDuration: 30 },
  { name: 'Round 4 - Elimination', type: 'ELIMINATION', timerDuration: 25 },
  { name: 'Round 5 - Majority Rules', type: 'MAJORITY_RULES', timerDuration: 25 },
  { name: 'Round 6 - Final Multiple Choice', type: 'FINAL_MULTIPLE_CHOICE', timerDuration: 30 },
  { name: 'Final Round - Final Wager', type: 'FINAL_WAGER', timerDuration: 30 },
];

const getQuestionsCountForRound = (roundType) =>
  QUESTIONS_PER_ROUND_BY_TYPE[roundType] ?? QUESTIONS_PER_ROUND;

const o = (text, isCorrect = false) => ({ text, isCorrect });
const q = (text, options, category, mediaKey = null) => ({
  text,
  options,
  category,
  mediaKey,
});

const ordering = (text, items, category, mediaKey = null) => ({
  text,
  options: items.map((item) => ({ text: item.text, isCorrect: false, correctOrder: item.order })),
  category,
  mediaKey,
});

const ROUND_ONE_ORDERING_QUESTION = ordering(
  'Put these events in chronological order (earliest to latest).',
  [
    { text: 'World War I begins (1914)', order: 1 },
    { text: 'World War II ends (1945)', order: 2 },
    { text: 'First Moon landing (1969)', order: 3 },
    { text: 'World Wide Web goes public (1991)', order: 4 },
  ],
  'History',
  'imageHistory',
);

/** Real trivia content — mediaKey resolved by seedMedia.ensureSeedMediaUrls() */
const QUESTION_BANK = {
  MULTIPLE_CHOICE: [
    q('What is the capital city of Australia?', [o('Sydney'), o('Canberra', true), o('Melbourne'), o('Perth')], 'Geography', 'imageGeography'),
    q('Which gas do plants primarily absorb from the atmosphere?', [o('Oxygen'), o('Nitrogen'), o('Carbon dioxide', true), o('Helium')], 'Science', 'imageScience'),
    q('Who wrote the play "Romeo and Juliet"?', [o('Charles Dickens'), o('William Shakespeare', true), o('Jane Austen'), o('Mark Twain')], 'Literature'),
    q('How many continents are there on Earth?', [o('5'), o('6'), o('7', true), o('8')], 'General Knowledge'),
    q('Which planet is known as the Red Planet?', [o('Venus'), o('Mars', true), o('Jupiter'), o('Mercury')], 'Science', 'imageScience'),
    q('In computing, what does CPU stand for?', [o('Central Processing Unit', true), o('Core Power Unit'), o('Computer Primary Utility'), o('Central Performance Utility')], 'Technology', 'imageTech'),
    q('Which ocean is the largest by area?', [o('Atlantic Ocean'), o('Indian Ocean'), o('Pacific Ocean', true), o('Arctic Ocean')], 'Geography', 'imageGeography'),
    q('Which language has the most native speakers worldwide?', [o('English'), o('Spanish'), o('Mandarin Chinese', true), o('Hindi')], 'Language'),
    q('What is the boiling point of water at sea level?', [o('90 C'), o('95 C'), o('100 C', true), o('110 C')], 'Science'),
    q('Which country is famous for the city of Machu Picchu?', [o('Mexico'), o('Peru', true), o('Chile'), o('Brazil')], 'History', 'imageHistory'),
  ],
  WAGER: [
    q('Which country has the largest population?', [o('India', true), o('China'), o('United States'), o('Indonesia')], 'Current Affairs', 'imageGeography'),
    q('What is the chemical symbol for gold?', [o('Au', true), o('Ag'), o('Gd'), o('Go')], 'Science'),
    q('Which company created the iPhone?', [o('Samsung'), o('Apple', true), o('Google'), o('Sony')], 'Technology', 'imageTech'),
    q('How many days are there in a leap year?', [o('365'), o('366', true), o('364')], 'General Knowledge'),
    q('Which is the smallest prime number?', [o('0'), o('1'), o('2', true), o('3')], 'Math'),
    q('Which river is generally considered the longest in the world?', [o('Nile', true), o('Amazon'), o('Yangtze'), o('Mississippi')], 'Geography'),
    q('Which sport uses a shuttlecock?', [o('Tennis'), o('Badminton', true), o('Squash'), o('Table Tennis')], 'Sports'),
    q('Which instrument has 88 keys?', [o('Guitar'), o('Piano', true), o('Violin'), o('Flute')], 'Music'),
    q('Who painted the Mona Lisa?', [o('Vincent van Gogh'), o('Leonardo da Vinci', true), o('Pablo Picasso'), o('Claude Monet')], 'Art', 'imageHistory'),
    q('What is the hardest natural substance?', [o('Gold'), o('Diamond', true), o('Quartz'), o('Iron')], 'Science'),
  ],
  MUSIC: [
    q('Which artist released the song "Shape of You"?', [o('Ed Sheeran', true), o('Shawn Mendes'), o('Justin Bieber'), o('Charlie Puth')], 'Pop Music', 'musicUplifting'),
    q('Which band is known for the song "Bohemian Rhapsody"?', [o('The Beatles'), o('Queen', true), o('Pink Floyd'), o('U2')], 'Classic Rock', 'musicOrchestral'),
    q('How many lines are there on a standard musical staff?', [o('4'), o('5', true), o('6'), o('7')], 'Music Theory', 'musicUplifting'),
    q('Which instrument is commonly associated with jazz improvisation?', [o('Saxophone', true), o('Cello'), o('Tuba'), o('Harp')], 'Jazz', 'musicOrchestral'),
    q('Which singer is known as the "King of Pop"?', [o('Elvis Presley'), o('Michael Jackson', true), o('Prince'), o('Bruno Mars')], 'Pop Music', 'musicUplifting'),
    q('In a typical orchestra, which section includes the violin?', [o('Percussion'), o('Strings', true), o('Brass'), o('Woodwind')], 'Classical Music', 'musicOrchestral'),
    q('Which song begins with the lyric "Is this the real life?"', [o('Imagine'), o('Bohemian Rhapsody', true), o('Hey Jude'), o('Hotel California')], 'Classic Rock', 'musicUplifting'),
    q('Which Indian composer won two Oscars for Slumdog Millionaire?', [o('A. R. Rahman', true), o('Ilaiyaraaja'), o('Shankar Mahadevan'), o('Vishal Dadlani')], 'Film Music', 'musicOrchestral'),
    q('What does BPM stand for in music?', [o('Beats Per Minute', true), o('Bars Per Melody'), o('Bass Per Measure'), o('Beat Pattern Mode')], 'Music Theory', 'musicUplifting'),
    q('Which streaming platform is known for its green logo?', [o('Apple Music'), o('Spotify', true), o('SoundCloud'), o('YouTube Music')], 'Music Tech', 'musicOrchestral'),
  ],
  ELIMINATION: [
    q('Which is the largest mammal?', [o('Elephant'), o('Blue Whale', true), o('Giraffe'), o('Hippopotamus')], 'Nature', 'imageScience'),
    q('What is H2O commonly known as?', [o('Hydrogen Peroxide'), o('Water', true), o('Salt'), o('Ozone')], 'Science'),
    q('Which country hosted the 2016 Summer Olympics?', [o('China'), o('Brazil', true), o('UK'), o('Japan')], 'Sports'),
    q('Which planet has prominent rings?', [o('Mars'), o('Saturn', true), o('Earth'), o('Venus')], 'Space', 'imageScience'),
    q('What is 9 x 8?', [o('64'), o('72', true), o('81'), o('69')], 'Math'),
    q('Which continent is Egypt located in?', [o('Asia'), o('Africa', true), o('Europe'), o('South America')], 'Geography'),
    q('Who is known for the theory of relativity?', [o('Isaac Newton'), o('Albert Einstein', true), o('Galileo'), o('Nikola Tesla')], 'Science'),
    q('Which device stores electric charge?', [o('Resistor'), o('Capacitor', true), o('Inductor'), o('Transformer')], 'Technology', 'imageTech'),
    q('Which festival is known as the festival of lights in India?', [o('Holi'), o('Diwali', true), o('Pongal'), o('Eid')], 'Culture'),
    q('Which element has atomic number 1?', [o('Helium'), o('Hydrogen', true), o('Oxygen'), o('Carbon')], 'Science'),
  ],
  MAJORITY_RULES: [
    q('Pick the option you think most teams will choose for "best smartphone OS".', [o('Android', true), o('iOS'), o('Both equally'), o('Not sure')], 'Opinion'),
    q('Pick what you think most people prefer for weekend entertainment.', [o('Movies/Series', true), o('Gaming'), o('Sports'), o('Reading')], 'Opinion'),
    q('Which social platform do you think most teams use daily?', [o('Instagram', true), o('X/Twitter'), o('LinkedIn'), o('Reddit')], 'Opinion'),
    q('What time do you think most people prefer to wake up?', [o('Before 6 AM'), o('6-8 AM', true), o('8-10 AM'), o('After 10 AM')], 'Opinion'),
    q('Which drink do you think is most ordered at cafes?', [o('Espresso'), o('Latte/Cappuccino', true), o('Tea'), o('Cold Brew')], 'Opinion'),
    q('Which genre do you think most teams enjoy most?', [o('Comedy', true), o('Action'), o('Thriller'), o('Documentary')], 'Opinion'),
    q('Pick what you think is the most-used communication app.', [o('WhatsApp', true), o('Telegram'), o('Signal'), o('Discord')], 'Opinion'),
    q('For travel, what do you think most people pick first?', [o('Budget', true), o('Luxury'), o('Adventure'), o('Staycation')], 'Opinion'),
    q('Which meal do you think people skip most often?', [o('Breakfast', true), o('Lunch'), o('Dinner'), o('None')], 'Opinion'),
    q('Which is most likely the favorite pet overall?', [o('Dog', true), o('Cat'), o('Bird'), o('Fish')], 'Opinion'),
  ],
  FINAL_MULTIPLE_CHOICE: [
    q('Watch the clip on the venue screen — what type of content is being shown?', [o('Sports highlights'), o('Product demo', true), o('Weather report'), o('Cooking tutorial')], 'Observation', 'videoObservation'),
    q('Which country has the city of Barcelona?', [o('Italy'), o('Spain', true), o('Portugal'), o('France')], 'Geography', 'imageGeography'),
    q('What does HTTP stand for?', [o('HyperText Transfer Protocol', true), o('HighText Transfer Protocol'), o('Hyper Transfer Text Program'), o('Host Text Transport Protocol')], 'Technology'),
    q('Which scientist discovered penicillin?', [o('Alexander Fleming', true), o('Louis Pasteur'), o('Marie Curie'), o('Gregor Mendel')], 'Science', 'imageScience'),
    q('Which number is a prime?', [o('21'), o('29', true), o('35'), o('39')], 'Math'),
    q('Which country uses the Yen as currency?', [o('South Korea'), o('Japan', true), o('China'), o('Thailand')], 'Economics'),
    q('Which organ pumps blood throughout the human body?', [o('Lungs'), o('Heart', true), o('Liver'), o('Kidney')], 'Biology'),
    q('What is the tallest mountain above sea level?', [o('K2'), o('Mount Everest', true), o('Kangchenjunga'), o('Lhotse')], 'Geography'),
    q('Which year did the World Wide Web become publicly available?', [o('1989'), o('1991', true), o('1995'), o('1999')], 'Technology', 'imageTech'),
    q('Which blood type is known as the universal donor (RBC)?', [o('AB+'), o('O-', true), o('A+'), o('B-')], 'Biology'),
  ],
  FINAL_WAGER: [
    q('Which city is known as the "City of Canals"?', [o('Amsterdam'), o('Venice', true), o('Prague'), o('Budapest')], 'Geography', 'imageHistory'),
  ],
};

function resolveQuestionTemplate(roundType, questionOrder) {
  if (roundType === 'MULTIPLE_CHOICE' && Number(questionOrder) === 9) {
    return ROUND_ONE_ORDERING_QUESTION;
  }
  const bank = QUESTION_BANK[roundType];
  if (!bank || bank.length === 0) return null;
  return bank[questionOrder % bank.length];
}

function materializeQuestion(template, mediaUrls) {
  if (!template) return null;
  const media = template.mediaKey ? mediaUrls[template.mediaKey] : null;
  return {
    text: template.text,
    options: template.options,
    category: template.category,
    mediaUrl: media?.mediaUrl ?? null,
    mediaType: media?.mediaType ?? null,
  };
}

function getAllQuizTitles() {
  return [
    ...QUIZ_DEFINITIONS.map((q) => q.title),
    ...QUIZ_DEFINITIONS.map((q) => `${QUIZ_TITLE_PREFIX} ${q.code}`),
  ];
}

module.exports = {
  QUESTIONS_PER_ROUND,
  QUESTIONS_PER_ROUND_BY_TYPE,
  QUIZ_TITLE_PREFIX,
  QUIZ_DEFINITIONS,
  ROUND_BLUEPRINT,
  ROUND_ONE_ORDERING_QUESTION,
  QUESTION_BANK,
  getQuestionsCountForRound,
  resolveQuestionTemplate,
  materializeQuestion,
  getAllQuizTitles,
};
