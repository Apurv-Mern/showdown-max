'use strict';

const QUIZ_TITLE_PREFIX = 'Auto Generated Quiz';

const q = (text, options, category) => ({ text, options, category });
const o = (text, isCorrect = false) => ({ text, isCorrect });

const QUESTION_BANK = {
  MULTIPLE_CHOICE: [
    q('What is the capital city of Australia?', [o('Sydney'), o('Canberra', true), o('Melbourne'), o('Perth')], 'Geography'),
    q('Which gas do plants primarily absorb from the atmosphere?', [o('Oxygen'), o('Nitrogen'), o('Carbon dioxide', true), o('Helium')], 'Science'),
    q('Who wrote the play "Romeo and Juliet"?', [o('Charles Dickens'), o('William Shakespeare', true), o('Jane Austen'), o('Mark Twain')], 'Literature'),
    q('How many continents are there on Earth?', [o('5'), o('6'), o('7', true), o('8')], 'General Knowledge'),
    q('Which planet is known as the Red Planet?', [o('Venus'), o('Mars', true), o('Jupiter'), o('Mercury')], 'Science'),
    q('In computing, what does CPU stand for?', [o('Central Processing Unit', true), o('Core Power Unit'), o('Computer Primary Utility'), o('Central Performance Utility')], 'Technology'),
    q('Which ocean is the largest by area?', [o('Atlantic Ocean'), o('Indian Ocean'), o('Pacific Ocean', true), o('Arctic Ocean')], 'Geography'),
    q('Which language has the most native speakers worldwide?', [o('English'), o('Spanish'), o('Mandarin Chinese', true), o('Hindi')], 'Language'),
    q('What is the boiling point of water at sea level?', [o('90 C'), o('95 C'), o('100 C', true), o('110 C')], 'Science'),
    q('Which country is famous for the city of Machu Picchu?', [o('Mexico'), o('Peru', true), o('Chile'), o('Brazil')], 'History'),
  ],
  WAGER: [
    q('Which country has the largest population (2026)?', [o('India', true), o('China'), o('United States'), o('Indonesia')], 'Current Affairs'),
    q('What is the chemical symbol for gold?', [o('Au', true), o('Ag'), o('Gd'), o('Go')], 'Science'),
    q('Which company created the iPhone?', [o('Samsung'), o('Apple', true), o('Google'), o('Sony')], 'Technology'),
    q('How many days are there in a leap year?', [o('365'), o('366', true), o('364')], 'General Knowledge'),
    q('Which is the smallest prime number?', [o('0'), o('1'), o('2', true), o('3')], 'Math'),
    q('Which river is generally considered the longest in the world?', [o('Nile', true), o('Amazon'), o('Yangtze'), o('Mississippi')], 'Geography'),
    q('Which sport uses a shuttlecock?', [o('Tennis'), o('Badminton', true), o('Squash'), o('Table Tennis')], 'Sports'),
    q('Which instrument has 88 keys?', [o('Guitar'), o('Piano', true), o('Violin'), o('Flute')], 'Music'),
    q('Who painted the Mona Lisa?', [o('Vincent van Gogh'), o('Leonardo da Vinci', true), o('Pablo Picasso'), o('Claude Monet')], 'Art'),
    q('What is the hardest natural substance?', [o('Gold'), o('Diamond', true), o('Quartz'), o('Iron')], 'Science'),
  ],
  MUSIC: [
    q('Which artist released the song "Shape of You"?', [o('Ed Sheeran', true), o('Shawn Mendes'), o('Justin Bieber'), o('Charlie Puth')], 'Pop Music'),
    q('Which band is known for the song "Bohemian Rhapsody"?', [o('The Beatles'), o('Queen', true), o('Pink Floyd'), o('U2')], 'Classic Rock'),
    q('How many lines are there on a standard musical staff?', [o('4'), o('5', true), o('6'), o('7')], 'Music Theory'),
    q('Which instrument is commonly associated with jazz improvisation?', [o('Saxophone', true), o('Cello'), o('Tuba'), o('Harp')], 'Jazz'),
    q('Which singer is known as the "King of Pop"?', [o('Elvis Presley'), o('Michael Jackson', true), o('Prince'), o('Bruno Mars')], 'Pop Music'),
    q('In a typical orchestra, which section includes the violin?', [o('Percussion'), o('Strings', true), o('Brass'), o('Woodwind')], 'Classical Music'),
    q('Which song begins with the lyric "Is this the real life?"', [o('Imagine'), o('Bohemian Rhapsody', true), o('Hey Jude'), o('Hotel California')], 'Classic Rock'),
    q('Which Indian composer won two Oscars for Slumdog Millionaire?', [o('A. R. Rahman', true), o('Ilaiyaraaja'), o('Shankar Mahadevan'), o('Vishal Dadlani')], 'Film Music'),
    q('What does BPM stand for in music?', [o('Beats Per Minute', true), o('Bars Per Melody'), o('Bass Per Measure'), o('Beat Pattern Mode')], 'Music Theory'),
    q('Which streaming platform is known for its green logo?', [o('Apple Music'), o('Spotify', true), o('SoundCloud'), o('YouTube Music')], 'Music Tech'),
  ],
  ELIMINATION: [
    q('Which is the largest mammal?', [o('Elephant'), o('Blue Whale', true), o('Giraffe'), o('Hippopotamus')], 'Nature'),
    q('What is H2O commonly known as?', [o('Hydrogen Peroxide'), o('Water', true), o('Salt'), o('Ozone')], 'Science'),
    q('Which country hosted the 2016 Summer Olympics?', [o('China'), o('Brazil', true), o('UK'), o('Japan')], 'Sports'),
    q('Which planet has prominent rings?', [o('Mars'), o('Saturn', true), o('Earth'), o('Venus')], 'Space'),
    q('What is 9 x 8?', [o('64'), o('72', true), o('81'), o('69')], 'Math'),
    q('Which continent is Egypt located in?', [o('Asia'), o('Africa', true), o('Europe'), o('South America')], 'Geography'),
    q('Who is known for the theory of relativity?', [o('Isaac Newton'), o('Albert Einstein', true), o('Galileo'), o('Nikola Tesla')], 'Science'),
    q('Which device stores electric charge?', [o('Resistor'), o('Capacitor', true), o('Inductor'), o('Transformer')], 'Technology'),
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
    q('Which country has the city of Barcelona?', [o('Italy'), o('Spain', true), o('Portugal'), o('France')], 'Geography'),
    q('What does HTTP stand for?', [o('HyperText Transfer Protocol', true), o('HighText Transfer Protocol'), o('Hyper Transfer Text Program'), o('Host Text Transport Protocol')], 'Technology'),
    q('Which scientist discovered penicillin?', [o('Alexander Fleming', true), o('Louis Pasteur'), o('Marie Curie'), o('Gregor Mendel')], 'Science'),
    q('Which number is a prime?', [o('21'), o('29', true), o('35'), o('39')], 'Math'),
    q('Which country uses the Yen as currency?', [o('South Korea'), o('Japan', true), o('China'), o('Thailand')], 'Economics'),
    q('Which organ pumps blood throughout the human body?', [o('Lungs'), o('Heart', true), o('Liver'), o('Kidney')], 'Biology'),
    q('What is the tallest mountain above sea level?', [o('K2'), o('Mount Everest', true), o('Kangchenjunga'), o('Lhotse')], 'Geography'),
    q('Which year did the World Wide Web become publicly available?', [o('1989'), o('1991', true), o('1995'), o('1999')], 'Technology'),
    q('Which color is formed by mixing blue and yellow?', [o('Red'), o('Green', true), o('Purple'), o('Orange')], 'General Knowledge'),
    q('Which blood type is known as the universal donor (RBC)?', [o('AB+'), o('O-', true), o('A+'), o('B-')], 'Biology'),
  ],
  FINAL_WAGER: [
    q('Which city is known as the "City of Canals"?', [o('Amsterdam'), o('Venice', true), o('Prague'), o('Budapest')], 'Geography'),
    q('What is the speed of light in vacuum (approx)?', [o('300,000 km/s', true), o('30,000 km/s'), o('3,000 km/s'), o('3,000,000 km/s')], 'Science'),
    q('Which language is primarily spoken in Brazil?', [o('Spanish'), o('Portuguese', true), o('English'), o('French')], 'Language'),
    q('Who developed the theory of evolution by natural selection?', [o('Charles Darwin', true), o('Gregor Mendel'), o('James Watson'), o('Rosalind Franklin')], 'Science'),
    q('Which company developed Windows OS?', [o('Apple'), o('Microsoft', true), o('IBM'), o('Google')], 'Technology'),
    q('How many degrees are in a right angle?', [o('45'), o('90', true), o('120'), o('180')], 'Math'),
    q('Which is the longest-running animated TV series?', [o('Family Guy'), o('The Simpsons', true), o('South Park'), o('SpongeBob')], 'Entertainment'),
    q('Which metal is liquid at room temperature?', [o('Mercury', true), o('Aluminum'), o('Copper'), o('Lead')], 'Science'),
    q('What does DNA stand for?', [o('Deoxyribonucleic Acid', true), o('Dynamic Nucleic Acid'), o('Dual Nitrogen Atom'), o('Digital Nerve Array')], 'Biology'),
    q('Which country won the FIFA World Cup in 2022?', [o('France'), o('Argentina', true), o('Brazil'), o('Germany')], 'Sports'),
  ],
};

module.exports = {
  async up(queryInterface) {
    const [quizRows] = await queryInterface.sequelize.query(
      'SELECT id, title FROM quizzes WHERE title LIKE :prefix ORDER BY id ASC',
      { replacements: { prefix: `${QUIZ_TITLE_PREFIX}%` } },
    );

    for (const quiz of quizRows) {
      const [roundRows] = await queryInterface.sequelize.query(
        'SELECT id, type, `order` FROM rounds WHERE quizId = :quizId ORDER BY `order` ASC',
        { replacements: { quizId: quiz.id } },
      );

      for (const round of roundRows) {
        const bank = QUESTION_BANK[round.type];
        if (!bank || bank.length === 0) continue;

        const [questionRows] = await queryInterface.sequelize.query(
          'SELECT id, `order` FROM questions WHERE roundId = :roundId ORDER BY `order` ASC',
          { replacements: { roundId: round.id } },
        );

        for (const questionRow of questionRows) {
          const template = bank[questionRow.order % bank.length];
          await queryInterface.bulkUpdate(
            'questions',
            {
              text: template.text,
              options: JSON.stringify(template.options),
              category: template.category,
              mediaUrl: null,
              mediaType: null,
              updatedAt: new Date(),
            },
            { id: questionRow.id },
          );
        }
      }
    }
  },

  async down() {
    // No-op by design; this seeder enriches generated data for readability.
  },
};
