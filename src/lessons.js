// ---------- Check helpers ----------
const H = {
  lines(s) { return String(s).replace(/\r/g, '').split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== ''); },
  last(s, n) { return H.lines(s).slice(-n); },
  squash(s) { return String(s).replace(/\s+/g, '').toLowerCase(); },
  count(code, re) { return (H.strip(code).match(re) || []).length; },
  // code with comments removed (so "# use //" doesn't count)
  strip(code) { return String(code).split('\n').map(l => l.replace(/#.*$/, '')).join('\n'); },
  uses(code, re) { return re.test(H.strip(code)); },
  ok() { return { ok: true }; },
  no(msg) { return { ok: false, msg }; },
  same(got, want) {
    for (let i = 0; i < want.length; i++) {
      if ((got[i] || '').trim() !== want[i]) {
        return H.no(`Line ${i + 1} should be <code>${esc(want[i])}</code> but your program printed <code>${esc(got[i] || '(nothing)')}</code>.`);
      }
    }
    return null;
  },
  segs(t) {
    return t.turtle.ops.filter(o => o[0] === 'line').map(o => ({
      x1: o[1], y1: o[2], x2: o[3], y2: o[4], color: String(o[5]).toLowerCase(),
      len: Math.hypot(o[3] - o[1], o[4] - o[2])
    })).filter(s => s.len > 0.5);
  },
  near(a, b, tol = 1.5) { return Math.abs(a - b) <= tol; },
  closed(segs) {
    if (!segs.length) return false;
    const a = segs[0], b = segs[segs.length - 1];
    return H.near(a.x1, b.x2) && H.near(a.y1, b.y2);
  },
  bbox(segs) {
    const xs = segs.flatMap(s => [s.x1, s.x2]), ys = segs.flatMap(s => [s.y1, s.y2]);
    return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  },
  // A regular closed polygon with n sides of length size somewhere in the drawing
  polygon(segs, n, size, color) {
    const pool = segs.filter(s => H.near(s.len, size) && (!color || s.color === color));
    for (let i = 0; i + n <= pool.length; i++) {
      const run = pool.slice(i, i + n);
      if (H.closed(run)) return true;
    }
    return false;
  }
};

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- Worlds ----------
const WORLDS = [
  { id: 1, name: 'Launch Pad', tag: 'World 1', blurb: 'Your first words in Python: printing, math, fixing bugs and drawing with a turtle.' },
  { id: 2, name: 'Memory Vault', tag: 'World 2', blurb: 'Store things in variables, play with words and make programs that talk back.' },
  { id: 3, name: 'Decision Dungeon', tag: 'World 3', blurb: 'Teach your programs to make choices, roll dice and play a real game.' }
];

// ---------- Missions ----------
const LESSONS = [
// ===================== WORLD 1 =====================
{
  id: 'hello', world: 1, title: 'Say Hello', skill: 'print()',
  story: `Hi, I'm Pip! I'm a python, and I speak one language perfectly: <b>Python</b>. A computer does exactly what you tell it. Nothing more, nothing less. Today you give your very first instruction.`,
  learn: [
    { title: 'Your first instruction', html: `<p><code>print()</code> shows something on the screen. Text goes inside quotes. Programmers call text in quotes a <b>string</b>.</p><p>Press <b>Run</b>. Then change the words and run it again.</p>`, code: `print("Hello, world!")` },
    { title: 'One line at a time', html: `<p>Python reads your program from top to bottom, one line at a time. Each <code>print</code> starts a new line.</p>`, code: `print("Ready")\nprint("Set")\nprint("Go!")` },
    { title: 'Text and numbers', html: `<p>Numbers don't need quotes. Put commas between things and <code>print</code> shows them all with spaces in between.</p>`, code: `print("I have", 3, "pet snakes")\nprint(2026)` },
    { title: 'Notes for humans', html: `<p>A line that starts with <code>#</code> is a <b>comment</b>. Python skips it completely. Use comments to leave notes for yourself.</p><p>Python is picky: <code>print</code> must be lowercase, every quote needs a partner, and every <code>(</code> needs a <code>)</code>.</p>`, code: `# This is a note. Python ignores it.\nprint("Only this line runs")` }
  ],
  quiz: { q: 'Which line correctly shows <b>Hi</b> on the screen?', options: ['print(Hi)', 'print("Hi")', 'Print("Hi")', 'print "Hi"'], answer: 1, why: 'Text needs quotes, print is all lowercase, and it needs round brackets.' },
  main: {
    prompt: `Make your explorer card. Print exactly <b>three lines</b>:<ol><li>your nickname</li><li>your favourite food</li><li>this exact sentence: <code>Python Quest, here I come!</code></li></ol>`,
    starter: `# Line 1: your nickname\n\n# Line 2: your favourite food\n\n# Line 3: the exact sentence\n`,
    hint: 'Use print three times, one for each line. Copy the last sentence exactly, with the comma and the !',
    solution: `print("Pip")\nprint("pizza")\nprint("Python Quest, here I come!")`,
    async check(t) {
      const r = await t.run();
      const L = H.lines(r.out);
      if (L.length < 3) return H.no(`Your program printed ${L.length} line(s). Pip needs 3.`);
      if (L[L.length - 1].trim() !== 'Python Quest, here I come!') return H.no('The last line must be exactly <code>Python Quest, here I come!</code>. Check capitals, the comma and the !');
      return H.ok();
    }
  },
  bonus: {
    prompt: `Print the same three lines using only <b>one</b> <code>print</code>. Secret code: <code>\\n</code> inside a string means "start a new line".`,
    starter: `print("Pip\\nNext line here")\n`,
    hint: 'Put all three lines in one string, with \\n between them.',
    solution: `print("Pip\\npizza\\nPython Quest, here I come!")`,
    async check(t) {
      if (H.count(t.code, /\bprint\s*\(/g) !== 1) return H.no('Use exactly one print for this one.');
      const L = H.lines((await t.run()).out);
      if (L.length < 3) return H.no('Pip only sees ' + L.length + ' line(s). Use \\n to break the string into 3 lines.');
      if (L[L.length - 1].trim() !== 'Python Quest, here I come!') return H.no('The last line must be <code>Python Quest, here I come!</code>');
      return H.ok();
    }
  }
},
{
  id: 'math', world: 1, title: 'Calculator Mode', skill: '+ - * / // %',
  story: `Every rocket launch needs math. Good news: Python is a super calculator that never gets tired and never makes a math mistake.`,
  learn: [
    { title: 'The basic four', html: `<p><code>+</code> adds, <code>-</code> subtracts, <code>*</code> multiplies (a star means times) and <code>/</code> divides. No quotes around math, or Python will treat it as text.</p>`, code: `print(7 + 5)\nprint(20 - 8)\nprint(6 * 7)\nprint(10 / 4)` },
    { title: 'Sharing cookies', html: `<p>Share 10 cookies between 4 friends. Each friend gets <b>2</b> whole cookies and <b>2</b> are left over.</p><ul><li><code>//</code> gives the whole part: <code>10 // 4</code> is 2</li><li><code>%</code> gives the leftover (the remainder): <code>10 % 4</code> is 2</li></ul>`, code: `print(10 // 4)\nprint(10 % 4)` },
    { title: 'Powers and order', html: `<p><code>**</code> means "to the power of": <code>2 ** 3</code> is 2 × 2 × 2.</p><p>Python follows math order: brackets first, then <code>**</code>, then <code>* / // %</code>, and <code>+ -</code> last.</p>`, code: `print(2 ** 3)\nprint(2 + 3 * 4)\nprint((2 + 3) * 4)` },
    { title: 'Numbers with a dot', html: `<p>A number with a decimal point is called a <b>float</b>. Dividing with <code>/</code> always gives a float, even when it divides evenly.</p>`, code: `print(8 / 2)\nprint(0.5 + 0.25)` }
  ],
  quiz: { q: 'What does <code>print(2 + 3 * 4)</code> show?', options: ['20', '14', '24', '2 + 3 * 4'], answer: 1, why: 'Multiplication happens first: 3 * 4 = 12, then 2 + 12 = 14.' },
  main: {
    prompt: `Pizza party! You have <b>3 pizzas</b>, each cut into <b>8 slices</b>, and <b>5 friends</b>. Print three lines:<ol><li>the total number of slices</li><li>how many <b>whole</b> slices each friend gets</li><li>how many slices are left over</li></ol>Let Python do all the math.`,
    starter: `# 3 pizzas, 8 slices each, 5 friends\nprint(3 * 8)\n`,
    hint: 'Total is 3 * 8. Each friend gets (3 * 8) // 5. Leftovers are (3 * 8) % 5.',
    solution: `print(3 * 8)\nprint((3 * 8) // 5)\nprint((3 * 8) % 5)`,
    async check(t) {
      const L = H.last((await t.run()).out, 3);
      const bad = H.same(L, ['24', '4', '4']); if (bad) return bad;
      if (!H.uses(t.code, /\/\//) || !H.uses(t.code, /%/)) return H.no('Right answers! Now make Python work them out with <code>//</code> and <code>%</code>.');
      return H.ok();
    }
  },
  bonus: {
    prompt: `How many seconds are in one day? In a 365-day year? Print both answers on separate lines. Build them from 60 seconds, 60 minutes and 24 hours. Don't type the final answers yourself.`,
    starter: `print(60 * 60)  # seconds in one hour\n`,
    hint: 'A day is 60 * 60 * 24 seconds. A year is that times 365.',
    solution: `print(60 * 60 * 24)\nprint(60 * 60 * 24 * 365)`,
    async check(t) {
      if (/86400|31536000/.test(H.strip(t.code))) return H.no('No typing the answer! Make Python calculate it.');
      const L = H.lines((await t.run()).out).map(s => s.trim());
      if (!L.includes('86400')) return H.no('Pip can\'t find the seconds in a day (it should print as a whole number).');
      if (!L.includes('31536000')) return H.no('Pip can\'t find the seconds in a year.');
      return H.ok();
    }
  }
},
{
  id: 'bugs', world: 1, title: 'Bug Hunt', skill: 'reading errors',
  story: `Uh-oh. Someone scrambled Pip's code! Every programmer writes bugs, even experts, every single day. The real skill is reading the clues and fixing them.`,
  learn: [
    { title: 'Errors are clues', html: `<p>When Python can't understand a line, it stops and reports an <b>error</b>. The report tells you <b>which line</b> and <b>what kind</b> of problem. Pip translates it into plain English for you.</p><p>Run this broken code and read the bug report.</p>`, code: `print("Hello)` },
    { title: 'The usual suspects', html: `<ul><li><b>SyntaxError</b>: a grammar rule is broken. A missing quote, bracket or comma.</li><li><b>NameError</b>: Python doesn't know that word. Often a typo, like <code>prnt</code>.</li><li><b>TypeError</b>: mixing things that don't mix, like text + a number.</li><li><b>IndentationError</b>: unexpected spaces at the start of a line.</li></ul>`, code: `prnt("typo!")` },
    { title: 'How to squash a bug', html: `<ol><li>Read the line number.</li><li>Look at that line, and the one just above it.</li><li>Fix <b>one</b> thing.</li><li>Run again. Repeat until it works.</li></ol>`, code: `print("Fixed it!"` }
  ],
  quiz: { q: `Python says <code>NameError: name 'prnt' is not defined</code>. What's the fix?`, options: ['Put quotes around prnt', 'Change prnt to print', 'Delete the whole line', 'Restart the computer'], answer: 1, why: 'NameError means Python does not know the word. Here it is a typo of print.' },
  main: {
    prompt: `This code has <b>three bugs</b>. Fix them so it prints:<pre class="want">Bug hunt begins!\nBugs found: 3\nBugs left: 0</pre>`,
    starter: `print("Bug hunt begins!)\nprnt("Bugs found:", 3)\nprint("Bugs left:" 0)\n`,
    hint: 'Line 1 is missing a closing quote. Line 2 has a typo. Line 3 needs a comma between the text and the number.',
    solution: `print("Bug hunt begins!")\nprint("Bugs found:", 3)\nprint("Bugs left:", 0)`,
    async check(t) {
      const L = H.last((await t.run()).out, 3).map(s => s.replace(/\s+/g, ' ').trim());
      return H.same(L, ['Bug hunt begins!', 'Bugs found: 3', 'Bugs left: 0']) || H.ok();
    }
  },
  bonus: {
    prompt: `Two trickier bugs. Fix this so it prints:<pre class="want">Score: 10\nDone</pre>`,
    starter: `print("Score: " + 10)\n  print("Done")\n`,
    hint: 'You can\'t add text and a number with +. Try a comma instead, or str(10). And line 2 should start right at the edge.',
    solution: `print("Score:", 10)\nprint("Done")`,
    async check(t) {
      const L = H.last((await t.run()).out, 2);
      if (L.length < 2 || H.squash(L[0]) !== 'score:10' || L[1].trim() !== 'Done') return H.no('Pip wants exactly <code>Score: 10</code> and then <code>Done</code>.');
      return H.ok();
    }
  }
},
{
  id: 'turtle', world: 1, title: 'Pip Draws', skill: 'turtle graphics',
  story: `Meet Pip's best friend: a turtle holding a pen. Wherever the turtle walks, it leaves a line behind. You are the one giving directions.`,
  learn: [
    { title: 'Wake up the turtle', html: `<p><code>from turtle import *</code> gives you all the drawing commands. The turtle starts in the middle, facing right. <code>forward(100)</code> walks 100 steps.</p>`, code: `from turtle import *\nforward(100)` },
    { title: 'Turning corners', html: `<p><code>left(90)</code> turns left by 90 degrees, which is a square corner. <code>right(90)</code> turns the other way.</p>`, code: `from turtle import *\nforward(100)\nleft(90)\nforward(100)` },
    { title: 'Pens and colours', html: `<p><code>color("red")</code> changes the ink. <code>pensize(5)</code> makes it thicker. <code>penup()</code> lifts the pen so you can move without drawing, and <code>pendown()</code> puts it back.</p>`, code: `from turtle import *\ncolor("orange")\npensize(6)\nforward(60)\npenup()\nforward(30)\npendown()\nforward(60)` },
    { title: 'Angle math', html: `<p>A full spin is <b>360</b> degrees. To draw a shape and end up facing the same way, the turns must add up to 360. A square has 4 corners, so 360 ÷ 4 = <b>90</b> per corner. A triangle: 360 ÷ 3 = <b>120</b>.</p>`, code: `from turtle import *\ncolor("green")\nforward(100)\nleft(120)\nforward(100)\nleft(120)\nforward(100)\nleft(120)` }
  ],
  quiz: { q: 'To draw a square, how far should the turtle turn at each corner?', options: ['45', '90', '180', '360'], answer: 1, why: 'Four corners share a full 360 degree spin: 360 ÷ 4 = 90.' },
  main: {
    prompt: `Draw a <b>square</b> with each side <b>100</b> steps long. Any colour you like.`,
    starter: `from turtle import *\n\nforward(100)\nleft(90)\n`,
    hint: 'Walk forward 100 and turn left 90. Do that 4 times in total.',
    solution: `from turtle import *\nforward(100)\nleft(90)\nforward(100)\nleft(90)\nforward(100)\nleft(90)\nforward(100)\nleft(90)`,
    async check(t) {
      const r = await t.run();
      if (!r.turtle.used) return H.no('Pip doesn\'t see any drawing. Start with <code>from turtle import *</code>.');
      const S = H.segs(r);
      if (H.polygon(S, 4, 100)) return H.ok();
      if (S.length < 4) return H.no(`Pip counts ${S.length} side(s). A square needs 4.`);
      return H.no('Almost! Make sure every side is 100 and the last side ends where you started.');
    }
  },
  bonus: {
    prompt: `Draw a <b>hexagon</b>: 6 equal sides, each <b>80</b> steps long. Work out the turning angle yourself.`,
    starter: `from turtle import *\n\n`,
    hint: 'Six corners share 360 degrees. 360 ÷ 6 = ?',
    solution: `from turtle import *\n` + Array(6).fill('forward(80)\nleft(60)').join('\n'),
    async check(t) {
      const S = H.segs(await t.run());
      if (H.polygon(S, 6, 80)) return H.ok();
      return H.no('Pip needs 6 sides of 80 that join back up at the start. Check your angle.');
    }
  }
},

// ===================== WORLD 2 =====================
{
  id: 'variables', world: 2, title: 'Treasure Boxes', skill: 'variables',
  story: `Welcome to the Memory Vault! Games need to remember things: your score, your lives, your name. Python remembers using <b>variables</b>.`,
  learn: [
    { title: 'A box with a label', html: `<p><code>coins = 10</code> makes a box called <code>coins</code> and puts 10 inside. Here <code>=</code> means <b>put into</b>, not "equals".</p><p>Use the name later and Python looks inside the box.</p>`, code: `coins = 10\nprint(coins)\nprint(coins * 2)` },
    { title: 'Changing what is inside', html: `<p><code>coins = coins + 5</code> looks strange in math class. In Python it means: work out the right side first (10 + 5), then put the answer back in the box.</p><p>Shortcut: <code>coins += 5</code> does the same thing.</p>`, code: `coins = 10\ncoins = coins + 5\nprint(coins)\ncoins += 5\nprint(coins)` },
    { title: 'Good names', html: `<ul><li>Use letters, numbers and <code>_</code>. No spaces.</li><li>Can't start with a number: <code>2lives</code> won't work.</li><li>Capitals matter: <code>Score</code> and <code>score</code> are different boxes.</li><li>Pick names that explain themselves: <code>high_score</code> beats <code>hs</code>.</li></ul>`, code: `high_score = 900\nplayer_level = 4\nprint(high_score, player_level)` },
    { title: 'Boxes working together', html: `<p>Variables can be used to build new variables.</p>`, code: `width = 8\nheight = 5\narea = width * height\nprint("Area:", area)` }
  ],
  quiz: { q: 'What does this print?', code: 'x = 5\nx = x + 2\nprint(x)', options: ['5', '7', 'x + 2', '52'], answer: 1, why: 'Python works out x + 2 = 7, then stores 7 back in x.' },
  main: {
    prompt: `Game time! Start with <code>score = 0</code> and <code>lives = 3</code>. The player collects <b>two gems</b> worth <b>50 points each</b> (add to score twice), then <b>loses one life</b>. Finally print <code>score</code>, then <code>lives</code>.`,
    starter: `score = 0\nlives = 3\n\n# collect two gems (+50 each)\n\n# lose a life\n\nprint(score)\nprint(lives)\n`,
    hint: 'score = score + 50 (twice), then lives = lives - 1.',
    solution: `score = 0\nlives = 3\nscore = score + 50\nscore = score + 50\nlives = lives - 1\nprint(score)\nprint(lives)`,
    async check(t) {
      const c = H.strip(t.code);
      if (!/score\s*=\s*0\b/.test(c) || !/lives\s*=\s*3\b/.test(c)) return H.no('Start with <code>score = 0</code> and <code>lives = 3</code>.');
      if (/\b100\b/.test(c)) return H.no('No shortcuts! Add 50 two times instead of typing 100.');
      return H.same(H.last((await t.run()).out, 2), ['100', '2']) || H.ok();
    }
  },
  bonus: {
    prompt: `Swap two boxes! Make <code>a</code> hold 9 and <code>b</code> hold 5, without typing 5 or 9 again. It should print <code>9 5</code>.`,
    starter: `a = 5\nb = 9\n# swap them here\n\nprint(a, b)\n`,
    hint: 'If you do a = b first, the 5 is lost forever. Save it in a third box first (temp = a). Or try Python\'s trick: a, b = b, a',
    solution: `a = 5\nb = 9\ntemp = a\na = b\nb = temp\nprint(a, b)`,
    async check(t) {
      const c = H.strip(t.code);
      if (H.count(c, /\b5\b/g) !== 1 || H.count(c, /\b9\b/g) !== 1) return H.no('Use 5 and 9 only once each, in the first two lines.');
      return H.same(H.last((await t.run()).out, 1), ['9 5']) || H.ok();
    }
  }
},
{
  id: 'strings', world: 2, title: 'Word Magic', skill: 'strings',
  story: `Pip found a spell book. Every spell works on <b>strings</b>: you can join words, repeat them, shout them or flip them backwards.`,
  learn: [
    { title: 'Joining strings', html: `<p><code>+</code> glues strings together. It does not add a space for you, so put spaces inside the quotes.</p>`, code: `first = "Pip"\nprint("Hello, " + first + "!")` },
    { title: 'Repeating', html: `<p><code>*</code> repeats a string. Great for borders.</p>`, code: `print("ha" * 3)\nprint("=" * 20)` },
    { title: 'Length', html: `<p><code>len()</code> counts the characters. Spaces count too.</p>`, code: `print(len("python"))\nprint(len("hi there"))` },
    { title: 'String spells', html: `<p>Strings have built-in <b>methods</b>. Put a dot after the string, then the method name.</p>`, code: `word = "Python Quest"\nprint(word.upper())\nprint(word.lower())\nprint(word.replace("Quest", "Party"))` },
    { title: 'Letters by position', html: `<p>Each letter has a position number, and counting starts at <b>0</b>. <code>word[0]</code> is the first letter. <code>word[-1]</code> is the last.</p>`, code: `word = "turtle"\nprint(word[0])\nprint(word[1])\nprint(word[-1])` }
  ],
  quiz: { q: 'What does <code>print("ha" * 3)</code> show?', options: ['ha3', 'hahaha', 'ha ha ha', 'An error'], answer: 1, why: '* repeats the string 3 times, with nothing in between.' },
  main: {
    prompt: `Start with <code>hero = "pip"</code>. Print three lines:<ol><li>the hero in capitals, using a method</li><li><code>Hello, pip!</code> built with <code>+</code></li><li>the length of hero, using <code>len()</code></li></ol>`,
    starter: `hero = "pip"\n\n`,
    hint: 'hero.upper() for line 1. "Hello, " + hero + "!" for line 2. len(hero) for line 3.',
    solution: `hero = "pip"\nprint(hero.upper())\nprint("Hello, " + hero + "!")\nprint(len(hero))`,
    async check(t) {
      if (!H.uses(t.code, /\.upper\(\)/)) return H.no('Use the <code>.upper()</code> spell for line 1.');
      if (!H.uses(t.code, /len\s*\(/)) return H.no('Use <code>len()</code> for line 3.');
      if (!H.uses(t.code, /\+/)) return H.no('Build line 2 with <code>+</code>.');
      return H.same(H.last((await t.run()).out, 3), ['PIP', 'Hello, pip!', '3']) || H.ok();
    }
  },
  bonus: {
    prompt: `Start with <code>word = "python"</code>. Print the first letter, the last letter, then the whole word <b>backwards</b>.<pre class="want">p\nn\nnohtyp</pre>`,
    starter: `word = "python"\n`,
    hint: 'word[0] and word[-1] for the letters. word[::-1] is a slice that walks backwards through the whole string.',
    solution: `word = "python"\nprint(word[0])\nprint(word[-1])\nprint(word[::-1])`,
    async check(t) {
      if (/nohtyp/.test(H.strip(t.code))) return H.no('Make Python flip it. Don\'t type it backwards yourself!');
      return H.same(H.last((await t.run()).out, 3), ['p', 'n', 'nohtyp']) || H.ok();
    }
  }
},
{
  id: 'fstrings', world: 2, title: 'Fill-in Sentences', skill: 'f-strings',
  story: `Pip wants to write messages like "Pip is 7 years old" where the name and number come from variables. There's a neat tool for that.`,
  learn: [
    { title: 'Text + number = bug', html: `<p>You can't glue a number to a string with <code>+</code>. Run this and read the bug report.</p>`, code: `age = 12\nprint("Age: " + age)` },
    { title: 'f-strings to the rescue', html: `<p>Put an <code>f</code> right before the quotes. Then anything inside <code>{ }</code> is replaced by its value.</p>`, code: `name = "Pip"\nage = 7\nprint(f"{name} is {age} years old")` },
    { title: 'Math inside the braces', html: `<p>You can even do math inside <code>{ }</code>.</p>`, code: `age = 7\nprint(f"Next year Pip will be {age + 1}")` },
    { title: 'Changing types', html: `<p><code>str(12)</code> turns a number into text. <code>int("12")</code> turns digit-text into a number. You will need <code>int()</code> in the next mission.</p>`, code: `print("Level " + str(5))\nprint(int("20") + 1)` }
  ],
  quiz: { q: 'What does this print?', code: 'name = "Ava"\nprint(f"Hi {name}")', options: ['Hi {name}', 'Hi Ava', 'f"Hi Ava"', 'Hi name'], answer: 1, why: 'The f makes Python replace {name} with the value stored in name.' },
  main: {
    prompt: `Use these variables and <b>one f-string</b> to print exactly:<pre class="want">Pip is 7 and loves apples.</pre>`,
    starter: `name = "Pip"\nage = 7\nfood = "apples"\n\n`,
    hint: 'print(f"{name} is {age} and loves {food}.")',
    solution: `name = "Pip"\nage = 7\nfood = "apples"\nprint(f"{name} is {age} and loves {food}.")`,
    async check(t) {
      if (!H.uses(t.code, /\bf["']/)) return H.no('Use an f-string: put <code>f</code> right before the opening quote.');
      if (!/\{name\}/.test(t.code) || !/\{food\}/.test(t.code)) return H.no('Use <code>{name}</code>, <code>{age}</code> and <code>{food}</code> inside the f-string.');
      return H.same(H.last((await t.run()).out, 1), ['Pip is 7 and loves apples.']) || H.ok();
    }
  },
  bonus: {
    prompt: `A shop sells potions for <code>price = 4.5</code> coins, and you buy <code>qty = 3</code>. Print the total with exactly <b>2 decimal places</b>:<pre class="want">Total: 13.50 coins</pre>`,
    starter: `price = 4.5\nqty = 3\n`,
    hint: 'Inside the braces, add :.2f after the value, like {price * qty:.2f}',
    solution: `price = 4.5\nqty = 3\nprint(f"Total: {price * qty:.2f} coins")`,
    async check(t) {
      if (!/:\.2f/.test(t.code)) return H.no('Use the <code>:.2f</code> format inside the braces.');
      return H.same(H.last((await t.run()).out, 1), ['Total: 13.50 coins']) || H.ok();
    }
  }
},
{
  id: 'input', world: 2, title: 'Talk to Pip', skill: 'input()',
  story: `So far your programs talk, but they never listen. Time to change that. With <code>input()</code> your program can ask a question and wait for an answer.`,
  learn: [
    { title: 'Asking a question', html: `<p><code>input("question")</code> shows the question and waits. Whatever the user types gets stored. On this site, an answer box appears in the output area.</p>`, code: `name = input("What's your name? ")\nprint("Nice to meet you,", name)` },
    { title: 'Input is always text', html: `<p>Even if you type <code>12</code>, <code>input()</code> gives you the string <code>"12"</code>. To do math, wrap it in <code>int()</code>.</p>`, code: `age = int(input("How old are you? "))\nprint(f"In 10 years you'll be {age + 10}")` },
    { title: 'Decimals', html: `<p>Use <code>float()</code> instead of <code>int()</code> when the answer might have a decimal point.</p>`, code: `height = float(input("Height in metres? "))\nprint(f"That's {height * 100} cm")` }
  ],
  quiz: { q: 'What does <code>input()</code> always give you?', options: ['A number', 'Text (a string)', 'True or False', 'It depends what you type'], answer: 1, why: 'input() always returns a string. Use int() or float() to turn it into a number.' },
  main: {
    prompt: `Ask for a name, then an age. Print a sentence like this (Pip will test it with different answers):<pre class="want">Ava will be 13 next year.</pre>`,
    starter: `name = input("Name? ")\n\n`,
    hint: 'age = int(input("Age? ")), then print(f"{name} will be {age + 1} next year.")',
    solution: `name = input("Name? ")\nage = int(input("Age? "))\nprint(f"{name} will be {age + 1} next year.")`,
    async check(t) {
      for (const [n, a] of [['Ava', 12], ['Sam', 15], ['Lee', 9]]) {
        const L = H.last((await t.run([n, a])).out, 1);
        const want = `${n} will be ${a + 1} next year.`;
        if (!L.length || !L[0].endsWith(want)) return H.no(`When the answers are <code>${n}</code> and <code>${a}</code>, the last line should be <code>${want}</code>`);
      }
      return H.ok();
    }
  },
  bonus: {
    prompt: `Ask for a number of minutes and turn it into hours and minutes:<pre class="want">135 minutes  →  2 h 15 min</pre>Print just the <code>2 h 15 min</code> part.`,
    starter: `minutes = int(input("Minutes? "))\n`,
    hint: 'Hours are minutes // 60. What is left over is minutes % 60.',
    solution: `minutes = int(input("Minutes? "))\nprint(f"{minutes // 60} h {minutes % 60} min")`,
    async check(t) {
      for (const m of [135, 60, 59, 0, 1000]) {
        const L = H.last((await t.run([m])).out, 1);
        const want = `${Math.floor(m / 60)} h ${m % 60} min`;
        if (!L.length || !L[0].endsWith(want)) return H.no(`For <code>${m}</code> minutes, Pip expects <code>${want}</code>`);
      }
      return H.ok();
    }
  }
},
{
  id: 'shapes', world: 2, title: 'Shape Factory', skill: 'variables + turtle',
  story: `Pip opened a shape factory. With variables, you can change one number and the whole drawing changes size.`,
  learn: [
    { title: 'One number controls everything', html: `<p>Store the size in a variable. Change <code>size</code> and run again: the whole square changes.</p>`, code: `from turtle import *\nsize = 120\nforward(size)\nleft(90)\nforward(size)\nleft(90)\nforward(size)\nleft(90)\nforward(size)\nleft(90)` },
    { title: 'Filling shapes', html: `<p>Call <code>begin_fill()</code> before drawing and <code>end_fill()</code> after. <code>color("black", "gold")</code> sets the outline and the fill colours.</p>`, code: `from turtle import *\ncolor("black", "gold")\nbegin_fill()\ncircle(60)\nend_fill()` },
    { title: 'Drawings that ask questions', html: `<p>Mix <code>input()</code> and turtle so the user picks the size.</p>`, code: `from turtle import *\nsize = int(input("How big? "))\ncircle(size)` }
  ],
  quiz: { q: 'What does this do?', code: 'size = 50\nforward(size * 2)', options: ['Walks 50 steps', 'Walks 100 steps', 'Walks 52 steps', 'Error'], answer: 1, why: 'size * 2 is 50 * 2 = 100.' },
  main: {
    prompt: `Use a variable called <code>side</code>. Draw a <b>red</b> square with <code>side = 60</code>. Then change <code>side</code> to 120 and draw a <b>blue</b> square.`,
    starter: `from turtle import *\n\nside = 60\ncolor("red")\n`,
    hint: 'Draw the 4 sides with forward(side) and left(90). Then side = 120, color("blue"), and the same 8 lines again.',
    solution: `from turtle import *\nside = 60\ncolor("red")\n` + Array(4).fill('forward(side)\nleft(90)').join('\n') + `\nside = 120\ncolor("blue")\n` + Array(4).fill('forward(side)\nleft(90)').join('\n'),
    async check(t) {
      if (!H.uses(t.code, /\bside\s*=/)) return H.no('Use a variable named <code>side</code>.');
      if (!H.uses(t.code, /forward\s*\(\s*side/)) return H.no('Walk with <code>forward(side)</code> so the variable controls the size.');
      const S = H.segs(await t.run());
      if (!H.polygon(S, 4, 60, 'red')) return H.no('Pip can\'t find a red square with sides of 60.');
      if (!H.polygon(S, 4, 120, 'blue')) return H.no('Pip can\'t find a blue square with sides of 120.');
      return H.ok();
    }
  },
  bonus: {
    prompt: `Ask the user for a size, then draw a <b>triangle</b> with sides that long. Pip will test it with different sizes.`,
    starter: `from turtle import *\n\n`,
    hint: 'size = int(input("Size? ")). A triangle turns 120 degrees at each corner.',
    solution: `from turtle import *\nsize = int(input("Size? "))\n` + Array(3).fill('forward(size)\nleft(120)').join('\n'),
    async check(t) {
      for (const n of [50, 150]) {
        const S = H.segs(await t.run([n]));
        if (!H.polygon(S, 3, n)) return H.no(`When the user types <code>${n}</code>, Pip expects a closed triangle with sides of ${n}.`);
      }
      return H.ok();
    }
  }
},

// ===================== WORLD 3 =====================
{
  id: 'booleans', world: 3, title: 'True or False', skill: 'comparisons',
  story: `The Decision Dungeon is full of doors, and each door asks a yes-or-no question. In Python, yes and no are called <b>True</b> and <b>False</b>.`,
  learn: [
    { title: 'Questions with two answers', html: `<p>A comparison asks a question. Python answers <code>True</code> or <code>False</code>.</p>`, code: `print(5 > 3)\nprint(2 > 7)\nprint(10 == 10)` },
    { title: 'All the comparisons', html: `<ul><li><code>==</code> equal to</li><li><code>!=</code> not equal to</li><li><code>&lt;</code> and <code>&gt;</code> less than, greater than</li><li><code>&lt;=</code> and <code>&gt;=</code> or equal</li></ul><p>Careful: one <code>=</code> puts a value in a box. Two <code>==</code> asks "are these equal?"</p>`, code: `coins = 30\nprint(coins == 30)\nprint(coins != 30)\nprint(coins >= 25)` },
    { title: 'and, or, not', html: `<p><code>and</code> is True only when <b>both</b> sides are True. <code>or</code> is True when <b>at least one</b> is. <code>not</code> flips True and False.</p>`, code: `sunny = True\nhomework_done = False\nprint(sunny and homework_done)\nprint(sunny or homework_done)\nprint(not homework_done)` },
    { title: 'Capitals count', html: `<p>Comparing strings is exact. Capital letters are different letters to Python.</p>`, code: `print("cat" == "cat")\nprint("cat" == "Cat")` }
  ],
  quiz: { q: 'Which one is <b>True</b>?', options: ['3 > 7', '"cat" == "Cat"', '10 >= 10', '4 != 4'], answer: 2, why: '>= means greater than OR equal to, and 10 is equal to 10.' },
  main: {
    prompt: `A roller coaster needs riders who are <b>at least 10</b> years old <b>and at least 140</b> cm tall. With <code>age = 9</code> and <code>height = 150</code>, print three lines:<ol><li>is age at least 10?</li><li>is height at least 140?</li><li>both together, using <code>and</code></li></ol>`,
    starter: `age = 9\nheight = 150\n`,
    hint: 'print(age >= 10), print(height >= 140), print(age >= 10 and height >= 140)',
    solution: `age = 9\nheight = 150\nprint(age >= 10)\nprint(height >= 140)\nprint(age >= 10 and height >= 140)`,
    async check(t) {
      const c = H.strip(t.code);
      if (/print\s*\(\s*(True|False)\s*\)/.test(c)) return H.no('Let Python decide! Print the comparisons, not True or False typed by you.');
      if (!/\band\b/.test(c)) return H.no('Use <code>and</code> for line 3.');
      if (!/>=/.test(c)) return H.no('Use <code>&gt;=</code> for "at least".');
      return H.same(H.last((await t.run()).out, 3), ['False', 'True', 'False']) || H.ok();
    }
  },
  bonus: {
    prompt: `Leap years! A year is a leap year if it divides by 4 but <b>not</b> by 100, <b>or</b> if it divides by 400. Ask for a year and print <code>True</code> or <code>False</code>.`,
    starter: `year = int(input("Year? "))\n`,
    hint: '"Divides by 4" means year % 4 == 0. Combine: (year % 4 == 0 and year % 100 != 0) or year % 400 == 0',
    solution: `year = int(input("Year? "))\nprint((year % 4 == 0 and year % 100 != 0) or year % 400 == 0)`,
    async check(t) {
      for (const [y, w] of [[2024, 'True'], [1900, 'False'], [2000, 'True'], [2023, 'False'], [2100, 'False']]) {
        const L = H.last((await t.run([y])).out, 1);
        if (!L.length || !L[0].endsWith(w)) return H.no(`For <code>${y}</code> Pip expects <code>${w}</code>.`);
      }
      return H.ok();
    }
  }
},
{
  id: 'ifelse', world: 3, title: 'Choose Your Path', skill: 'if / else',
  story: `Two doors. One leads to treasure, one to a grumpy troll. With <code>if</code>, your program can choose which door to open.`,
  learn: [
    { title: 'if', html: `<p>An <code>if</code> line ends with a colon <code>:</code>. The lines under it are pushed in by <b>4 spaces</b>. They only run when the condition is True.</p>`, code: `coins = 80\nif coins >= 50:\n    print("You can buy the sword!")\n    print("It sparkles.")` },
    { title: 'else', html: `<p><code>else:</code> runs when the condition is False. It has no condition of its own.</p>`, code: `coins = 20\nif coins >= 50:\n    print("You can buy the sword!")\nelse:\n    print("Keep collecting!")` },
    { title: 'Spaces matter', html: `<p>Indented lines belong to the <code>if</code>. A line back at the left edge always runs. Try changing <code>coins</code> to see.</p>`, code: `coins = 5\nif coins > 10:\n    print("Rich!")\nprint("This line always runs")` },
    { title: 'Deciding on input', html: `<p>Combine <code>input()</code> with <code>if</code> and your program reacts to the user.</p>`, code: `answer = input("Do you like snakes? ")\nif answer == "yes":\n    print("Pip likes you too!")\nelse:\n    print("Pip is a little hurt.")` }
  ],
  quiz: { q: 'Which print runs no matter what <code>x</code> is?', code: 'if x > 5:\n    print("A")\nprint("B")', options: ['A', 'B', 'Both', 'Neither'], answer: 1, why: 'print("B") is not indented, so it is not part of the if.' },
  main: {
    prompt: `Ask how many coins the player has. If it is <b>50 or more</b>, print <code>You can buy the sword!</code>. Otherwise print <code>Keep collecting!</code>`,
    starter: `coins = int(input("How many coins? "))\n\n`,
    hint: 'if coins >= 50: ... else: ... and remember the 4 spaces.',
    solution: `coins = int(input("How many coins? "))\nif coins >= 50:\n    print("You can buy the sword!")\nelse:\n    print("Keep collecting!")`,
    async check(t) {
      for (const [n, w] of [[50, 'You can buy the sword!'], [75, 'You can buy the sword!'], [49, 'Keep collecting!'], [0, 'Keep collecting!']]) {
        const L = H.last((await t.run([n])).out, 1);
        if (!L.length || !L[0].endsWith(w)) return H.no(`With <code>${n}</code> coins, Pip expects <code>${w}</code>`);
      }
      return H.ok();
    }
  },
  bonus: {
    prompt: `Ask for a whole number and print <code>even</code> or <code>odd</code>.`,
    starter: `n = int(input("Number? "))\n`,
    hint: 'A number is even when n % 2 == 0.',
    solution: `n = int(input("Number? "))\nif n % 2 == 0:\n    print("even")\nelse:\n    print("odd")`,
    async check(t) {
      for (const [n, w] of [[4, 'even'], [7, 'odd'], [0, 'even'], [-3, 'odd'], [100, 'even']]) {
        const L = H.last((await t.run([n])).out, 1);
        if (!L.length || !L[0].endsWith(w)) return H.no(`For <code>${n}</code> Pip expects <code>${w}</code>`);
      }
      return H.ok();
    }
  }
},
{
  id: 'elif', world: 3, title: 'Weather Wizard', skill: 'elif',
  story: `Pip became the dungeon's weather wizard. But there are more than two kinds of weather, so two doors are not enough.`,
  learn: [
    { title: 'More than two choices', html: `<p><code>elif</code> means "else if". Python checks each condition from top to bottom and runs only the <b>first</b> one that is True.</p>`, code: `score = 72\nif score >= 90:\n    print("Gold medal")\nelif score >= 70:\n    print("Silver medal")\nelif score >= 50:\n    print("Bronze medal")\nelse:\n    print("Try again")` },
    { title: 'Order matters', html: `<p>Here the checks are in the wrong order. A score of 95 stops at the first True check and never reaches "Gold". Fix it by swapping them.</p>`, code: `score = 95\nif score >= 50:\n    print("Bronze medal")\nelif score >= 90:\n    print("Gold medal")` }
  ],
  quiz: { q: 'With <code>temp = 25</code>, what prints?', code: 'if temp >= 30:\n    print("hot")\nelif temp >= 20:\n    print("warm")\nelse:\n    print("cool")', options: ['hot', 'warm', 'cool', 'warm and cool'], answer: 1, why: '25 is not >= 30, but it is >= 20. Python stops at the first True check.' },
  main: {
    prompt: `Ask for the temperature in °C and give advice:<ul><li>30 or more: <code>Hot! Drink water.</code></li><li>15 or more: <code>Nice day for a walk.</code></li><li>0 or more: <code>Grab a jacket.</code></li><li>below 0: <code>Snow day!</code></li></ul>`,
    starter: `temp = int(input("Temperature? "))\n\n`,
    hint: 'if temp >= 30: ... elif temp >= 15: ... elif temp >= 0: ... else: ...',
    solution: `temp = int(input("Temperature? "))\nif temp >= 30:\n    print("Hot! Drink water.")\nelif temp >= 15:\n    print("Nice day for a walk.")\nelif temp >= 0:\n    print("Grab a jacket.")\nelse:\n    print("Snow day!")`,
    async check(t) {
      const cases = [[35, 'Hot! Drink water.'], [30, 'Hot! Drink water.'], [20, 'Nice day for a walk.'], [15, 'Nice day for a walk.'], [5, 'Grab a jacket.'], [0, 'Grab a jacket.'], [-8, 'Snow day!']];
      for (const [n, w] of cases) {
        const L = H.last((await t.run([n])).out, 1);
        if (!L.length || !L[0].endsWith(w)) return H.no(`At <code>${n}</code>°C Pip expects <code>${w}</code>`);
      }
      return H.ok();
    }
  },
  bonus: {
    prompt: `FizzBuzz, the famous coding puzzle. Ask for a number. If it divides by 3 <b>and</b> 5, print <code>FizzBuzz</code>. If only by 3, <code>Fizz</code>. If only by 5, <code>Buzz</code>. Otherwise print the number.`,
    starter: `n = int(input("Number? "))\n`,
    hint: 'Check the FizzBuzz case first! n % 3 == 0 and n % 5 == 0',
    solution: `n = int(input("Number? "))\nif n % 3 == 0 and n % 5 == 0:\n    print("FizzBuzz")\nelif n % 3 == 0:\n    print("Fizz")\nelif n % 5 == 0:\n    print("Buzz")\nelse:\n    print(n)`,
    async check(t) {
      for (const [n, w] of [[15, 'FizzBuzz'], [30, 'FizzBuzz'], [9, 'Fizz'], [10, 'Buzz'], [7, '7']]) {
        const L = H.last((await t.run([n])).out, 1);
        if (!L.length || L[0].split(/\s+/).pop() !== w) return H.no(`For <code>${n}</code> Pip expects <code>${w}</code>`);
      }
      return H.ok();
    }
  }
},
{
  id: 'random', world: 3, title: 'Dice and Luck', skill: 'random',
  story: `Every good game needs a bit of luck. Python has a whole toolbox for randomness, ready to borrow.`,
  learn: [
    { title: 'Borrowing tools', html: `<p><code>import random</code> brings in Python's random toolbox. Put it at the top of your program.</p>`, code: `import random\nprint(random.randint(1, 6))` },
    { title: 'randint', html: `<p><code>random.randint(1, 6)</code> picks a whole number from 1 to 6. Both ends can be picked. Run it a few times!</p>`, code: `import random\nroll = random.randint(1, 6)\nprint("You rolled", roll)` },
    { title: 'choice', html: `<p><code>random.choice()</code> picks one item from a <b>list</b>. A list is several things inside square brackets. You will learn lots more about lists in World 4.</p>`, code: `import random\nsnack = random.choice(["apple", "cookie", "carrot"])\nprint("Pip eats a", snack)` },
    { title: 'Testing random programs', html: `<p>Random programs act differently every run, so run them several times to be sure every path works.</p>`, code: `import random\nif random.randint(1, 2) == 1:\n    print("Heads")\nelse:\n    print("Tails")` }
  ],
  quiz: { q: 'What can <code>random.randint(1, 3)</code> give you?', options: ['Only 1 or 2', '1, 2 or 3', '0, 1, 2 or 3', 'Any number at all'], answer: 1, why: 'Both ends are included, so 1, 2 and 3 are all possible.' },
  main: {
    prompt: `Roll two dice! Print three lines: the first die, the second die, and the total.`,
    starter: `import random\n\n`,
    hint: 'die1 = random.randint(1, 6), die2 the same, then print(die1), print(die2), print(die1 + die2)',
    solution: `import random\ndie1 = random.randint(1, 6)\ndie2 = random.randint(1, 6)\nprint(die1)\nprint(die2)\nprint(die1 + die2)`,
    async check(t) {
      const seen = new Set();
      for (let s = 1; s <= 12; s++) {
        const L = H.last((await t.run([], s)).out, 3).map(x => x.trim().split(/\s+/).pop());
        const [a, b, c] = L.map(Number);
        if (L.length < 3 || [a, b, c].some(isNaN)) return H.no('Pip expects three numbers on three lines.');
        if (a < 1 || a > 6 || b < 1 || b > 6) return H.no(`A die can only show 1 to 6, but Pip saw ${a} and ${b}.`);
        if (c !== a + b) return H.no(`${a} + ${b} isn't ${c}. Check your total.`);
        seen.add(a + ',' + b);
      }
      if (seen.size < 3) return H.no('Pip rolled 12 times and got almost the same dice every time. Use random.randint.');
      return H.ok();
    }
  },
  bonus: {
    prompt: `Coin guessing game. Ask <code>heads or tails? </code>, flip a random coin and print <code>The coin says heads</code> (or tails). Then print <code>You win!</code> or <code>You lose!</code>`,
    starter: `import random\nguess = input("heads or tails? ")\n`,
    hint: 'flip = random.choice(["heads", "tails"]), print("The coin says", flip), then if guess == flip: ...',
    solution: `import random\nguess = input("heads or tails? ")\nflip = random.choice(["heads", "tails"])\nprint("The coin says", flip)\nif guess == flip:\n    print("You win!")\nelse:\n    print("You lose!")`,
    async check(t) {
      const flips = new Set();
      for (const g of ['heads', 'tails']) for (let s = 1; s <= 8; s++) {
        const r = await t.run([g], s);
        const m = r.out.match(/The coin says (heads|tails)/);
        if (!m) return H.no('Pip needs a line like <code>The coin says heads</code>.');
        flips.add(m[1]);
        const want = m[1] === g ? 'You win!' : 'You lose!';
        const L = H.last(r.out, 1);
        if (!L.length || !L[0].endsWith(want)) return H.no(`The guess was <code>${g}</code> and the coin said <code>${m[1]}</code>, so Pip expects <code>${want}</code>`);
      }
      if (flips.size < 2) return H.no('The coin always lands the same way. Make it random!');
      return H.ok();
    }
  }
},
{
  id: 'rps', world: 3, title: 'Boss: Rock Paper Scissors', skill: 'everything so far', boss: true,
  story: `The Dungeon Boss challenges you to Rock Paper Scissors! Build the game yourself using everything you've learned: input, random, variables and if/elif/else.`,
  learn: [
    { title: 'Plan before you code', html: `<p>Real programmers plan first. Here is the plan:</p><ol><li>Ask the player for their move.</li><li>Let the computer pick a random move.</li><li>Print what the computer chose.</li><li>Decide who won and print it.</li></ol>` },
    { title: 'Who beats who', html: `<p>Rock beats scissors. Scissors beats paper. Paper beats rock. Same move: tie. You can check all three winning cases in one condition with <code>or</code>.</p>`, code: `player = "rock"\ncomputer = "scissors"\nif player == computer:\n    print("It's a tie!")\nelif (player == "rock" and computer == "scissors") or (player == "paper" and computer == "rock"):\n    print("You win! (add the scissors case too)")\nelse:\n    print("Computer wins!")` },
    { title: 'Tidy up the answer', html: `<p>People type things like <code>Rock </code> with capitals and spaces. <code>.lower()</code> makes it lowercase and <code>.strip()</code> trims spaces from the ends.</p>`, code: `move = "  Rock "\nprint(move.strip().lower())` }
  ],
  quiz: { q: 'The player picks <b>paper</b> and the computer picks <b>rock</b>. Who wins?', options: ['The player', 'The computer', 'Tie', 'Nobody, it\'s an error'], answer: 0, why: 'Paper covers rock, so the player wins.' },
  main: {
    prompt: `Build the game:<ol><li>Ask <code>rock, paper or scissors? </code></li><li>The computer picks randomly with <code>random.choice</code>.</li><li>Print <code>Computer chose rock</code> (or whatever it picked).</li><li>Print <code>It's a tie!</code>, <code>You win!</code> or <code>Computer wins!</code></li></ol>`,
    starter: `import random\n\nplayer = input("rock, paper or scissors? ")\ncomputer = random.choice(["rock", "paper", "scissors"])\nprint("Computer chose", computer)\n\n# decide who wins\n`,
    hint: 'Check for a tie first. Then one elif with the 3 winning cases joined by or. Everything else: Computer wins!',
    solution: `import random\nplayer = input("rock, paper or scissors? ")\ncomputer = random.choice(["rock", "paper", "scissors"])\nprint("Computer chose", computer)\nif player == computer:\n    print("It's a tie!")\nelif (player == "rock" and computer == "scissors") or (player == "paper" and computer == "rock") or (player == "scissors" and computer == "paper"):\n    print("You win!")\nelse:\n    print("Computer wins!")`,
    async check(t) {
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const comp = new Set();
      for (const p of ['rock', 'paper', 'scissors']) for (let s = 1; s <= 9; s++) {
        const r = await t.run([p], s);
        const m = r.out.match(/Computer chose (rock|paper|scissors)/);
        if (!m) return H.no('Pip needs a line like <code>Computer chose rock</code>.');
        const c = m[1]; comp.add(c);
        const want = p === c ? "It's a tie!" : beats[p] === c ? 'You win!' : 'Computer wins!';
        const L = H.last(r.out, 1);
        if (!L.length || !L[0].endsWith(want)) return H.no(`Player <code>${p}</code> vs computer <code>${c}</code> should print <code>${esc(want)}</code>`);
      }
      if (comp.size < 3) return H.no('The computer should be able to pick all three moves.');
      return H.ok();
    }
  },
  bonus: {
    prompt: `Make your game tougher to break:<ul><li><code>  ROCK </code> (capitals and spaces) should still count as rock.</li><li>Anything that isn't a move, like <code>banana</code>, should print only <code>That's not a move!</code> and stop. No computer move, no winner.</li></ul>`,
    starter: `import random\n\nplayer = input("rock, paper or scissors? ")\n`,
    hint: 'player = input(...).strip().lower(). Then if player not in ["rock", "paper", "scissors"]: print the message. Put the whole game inside an else.',
    solution: `import random\nplayer = input("rock, paper or scissors? ").strip().lower()\nif player not in ["rock", "paper", "scissors"]:\n    print("That's not a move!")\nelse:\n    computer = random.choice(["rock", "paper", "scissors"])\n    print("Computer chose", computer)\n    if player == computer:\n        print("It's a tie!")\n    elif (player == "rock" and computer == "scissors") or (player == "paper" and computer == "rock") or (player == "scissors" and computer == "paper"):\n        print("You win!")\n    else:\n        print("Computer wins!")`,
    async check(t) {
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      for (const bad of ['banana', '', 'rocks']) {
        const r = await t.run([bad], 3);
        if (/Computer chose/.test(r.out)) return H.no(`For <code>${esc(bad || '(empty)')}</code> the computer shouldn't play at all.`);
        const L = H.last(r.out, 1);
        if (!L.length || !L[0].endsWith("That's not a move!")) return H.no(`For <code>${esc(bad || '(empty)')}</code> Pip expects <code>That's not a move!</code>`);
      }
      for (const [typed, p] of [['  ROCK ', 'rock'], ['Paper', 'paper'], ['scissors ', 'scissors']]) for (let s = 1; s <= 6; s++) {
        const r = await t.run([typed], s);
        const m = r.out.match(/Computer chose (rock|paper|scissors)/);
        if (!m) return H.no(`For <code>${esc(typed)}</code> the game should still be played.`);
        const c = m[1];
        const want = p === c ? "It's a tie!" : beats[p] === c ? 'You win!' : 'Computer wins!';
        const L = H.last(r.out, 1);
        if (!L.length || !L[0].endsWith(want)) return H.no(`<code>${esc(typed)}</code> vs <code>${c}</code> should print <code>${esc(want)}</code>`);
      }
      return H.ok();
    }
  }
}
];
