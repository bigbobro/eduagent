import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { allCourses } from '../src/data/courses';
import type { Course, WordCard } from '../src/types/course';

const TARGET_COURSES = new Set([
  'school', 'fruits', 'vegetables', 'ocean', 'farm', 'jobs', 
  'insects', 'feelings', 'playground', 'opposites', 'instruments', 
  'party', 'bathroom', 'space', 'hobbies', 'magic', 'treats'
]);

// Cards that have already been generated natively or successfully replaced
const SKIP_CARDS = new Set([
  'school/school',
  'school/classroom',
  'school/teacher',
  'school/friend',
]);

function getSubjectDescription(card: WordCard, courseId: string): string {
  const name = card.english.toLowerCase();
  const cn = card.chinese;
  
  // Custom manual mappings for tricky or highly visual terms
  const manualDescriptions: Record<string, string> = {
    // School
    'desk': "A cute children's wooden school desk and a small chair next to it",
    'board': 'A clean green blackboard with a wooden frame',
    'book': "A cute colorful closed children's storybook with a drawing of a star on the cover",
    'pencil': 'A cute yellow pencil with a pink eraser tip',
    'bag': "A cute colorful children's school backpack",
    'crayon': 'Three cute colorful crayons (red, blue, yellow) standing together',
    'ruler': 'A simple yellow wooden ruler',
    'eraser': 'A cute blue and pink eraser',
    
    // Feelings
    'happy': 'A cute little cartoon animal smiling happily with rosy cheeks',
    'sad': 'A cute little cartoon animal crying a tiny tear, looking sad',
    'angry': 'A cute little cartoon animal with crossed arms, looking angry with red cheeks',
    'scared': 'A cute little cartoon animal shivering and looking scared with wide eyes',
    'tired': 'A cute little cartoon animal yawning and looking sleepy, tired',
    'surprised': 'A cute little cartoon animal gasping with wide open eyes, looking surprised',
    'excited': 'A cute little cartoon animal jumping joyfully with arms wide open, looking excited',
    'bored': 'A cute little cartoon animal sitting with its chin resting on its hand, looking bored',
    'proud': 'A cute little cartoon animal standing tall with a happy confident smile, looking proud',
    'shy': 'A cute little cartoon animal blushing and hiding slightly behind its hands, looking shy',
    'silly': 'A cute little cartoon animal sticking its tongue out and making a funny face, looking silly',
    'worried': 'A cute little cartoon animal with hands on its face and a worried expression',

    // Opposites
    'big': 'A giant cute elephant, representing big',
    'small': 'A tiny cute mouse, representing small',
    'hot': 'A steaming hot cup of cocoa, representing hot',
    'cold': 'A cute snowman with a scarf, representing cold',
    'tall': 'A tall friendly giraffe, representing tall',
    'short': 'A short little hedgehog, representing short',
    'fast': 'A cute cheetah running very fast',
    'slow': 'A cute turtle crawling slowly',
    'clean': 'A clean shiny white plate',
    'dirty': 'A muddy pig covered in brown dirt spots',
  };

  const key = `${courseId}/${card.id}`;
  if (manualDescriptions[card.id]) {
    return manualDescriptions[card.id];
  }
  if (manualDescriptions[key]) {
    return manualDescriptions[key];
  }

  // General fallbacks based on course category
  if (courseId === 'fruits') {
    return `A fresh and delicious single ${name} (${cn})`;
  }
  if (courseId === 'vegetables') {
    return `A fresh and crisp single ${name} (${cn})`;
  }
  if (courseId === 'ocean') {
    return `A cute friendly cartoon ${name} (${cn}) swimming in the clear blue sea`;
  }
  if (courseId === 'farm') {
    return `A cute friendly cartoon farm ${name} (${cn})`;
  }
  if (courseId === 'insects') {
    return `A cute friendly cartoon ${name} (${cn})`;
  }
  if (courseId === 'instruments') {
    return `A cute cartoon musical instrument ${name} (${cn})`;
  }
  if (courseId === 'treats') {
    return `A delicious and sweet ${name} (${cn})`;
  }
  if (courseId === 'space') {
    return `A cute cartoon ${name} (${cn}) in space`;
  }
  if (courseId === 'magic') {
    return `A whimsical cartoon ${name} (${cn}) from a fairy tale`;
  }
  if (courseId === 'jobs') {
    return `A friendly cartoon animal acting as a ${name} (${cn}) with professional tools`;
  }
  if (courseId === 'hobbies') {
    return `A cute cartoon animal engaged in ${name} (${cn})`;
  }
  if (courseId === 'playground') {
    return `A cute cartoon animal playing on a ${name} (${cn})`;
  }
  if (courseId === 'party') {
    return `A colorful cartoon ${name} (${cn}) for a children's party`;
  }
  if (courseId === 'bathroom') {
    return `A cute clean ${name} (${cn}) for a children's bathroom`;
  }

  return `A cute cartoon ${name} (${cn})`;
}

function runCmd(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command failed: ${cmd}\nError: ${error.message}\nStderr: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

async function main() {
  const jobs: { courseId: string; card: WordCard; finalPath: string; prompt: string }[] = [];
  const cutoffTime = new Date('2026-05-24T12:00:00+08:00').getTime();

  for (const course of allCourses) {
    if (!TARGET_COURSES.has(course.id)) continue;

    const wordCards = course.cards.filter((c) => c.kind === 'word');
    for (const card of wordCards) {
      const key = `${course.id}/${card.id}`;
      
      const relativePath = card.imageUrl.replace(/^\//, '');
      const finalPath = path.join(process.cwd(), 'public', relativePath);

      // Dynamic skip check: if file already generated/modified in this session, skip it
      let alreadyGenerated = false;
      if (fs.existsSync(finalPath)) {
        const stat = fs.statSync(finalPath);
        if (stat.mtimeMs > cutoffTime) {
          alreadyGenerated = true;
        }
      }

      if (SKIP_CARDS.has(key) || alreadyGenerated) {
        continue;
      }

      const subjectDesc = getSubjectDescription(card, course.id);

      const prompt = [
        `Generate one standalone children's ESL flashcard illustration for the word "${card.english}" (${card.chinese}).`,
        `${subjectDesc}, simple clear single subject, centered and easy for a 3-6 year old to recognize.`,
        'Soft watercolor storybook illustration, warm off-white paper background, gentle outline, square composition.',
        'No English text, no Chinese text, no letters, no border, no watermark, no photorealism, no 3D gloss, no neon.'
      ].join(' ');

      jobs.push({
        courseId: course.id,
        card,
        finalPath,
        prompt
      });
    }
  }

  if (jobs.length === 0) {
    console.log('All images have already been generated! Nothing to do.');
    return;
  }

  console.log(`Starting image generation: ${jobs.length} jobs to process sequentially.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const tempPath = path.join(process.cwd(), `tmp_${job.courseId}_${job.card.id}_${Date.now()}.png`);
    const seed = Math.floor(Math.random() * 100000) + 1;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(job.prompt)}?width=512&height=512&nologo=true&seed=${seed}`;

    console.log(`[${i + 1}/${jobs.length}] Starting: ${job.courseId}/${job.card.id} ("${job.card.english}")`);

    // Ensure the output folder exists
    const dir = path.dirname(job.finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let retryCount = 5;
    let completed = false;

    while (retryCount > 0 && !completed) {
      try {
        const cmd = `curl -L --retry 3 --max-time 60 -s "${url}" -o "${tempPath}" && sips -s format png "${tempPath}" --out "${job.finalPath}" && rm "${tempPath}"`;
        await runCmd(cmd);
        completed = true;
        successCount++;
        console.log(`[${i + 1}/${jobs.length}] ✓ Success: ${job.courseId}/${job.card.id}`);
      } catch (err: any) {
        retryCount--;
        console.warn(`[${i + 1}/${jobs.length}] Warning: Retry needed (${retryCount} attempts left) for ${job.courseId}/${job.card.id}. Reason: ${err.message.slice(0, 150)}...`);
        if (fs.existsSync(tempPath)) {
          try { fs.unlinkSync(tempPath); } catch (_) {}
        }
        if (retryCount === 0) {
          failCount++;
          console.error(`[${i + 1}/${jobs.length}] ✗ Failed after maximum retries: ${job.courseId}/${job.card.id}`);
        } else {
          // Wait 6 seconds before retrying (backoff)
          await new Promise((resolve) => setTimeout(resolve, 6000));
        }
      }
    }

    // Delay 1.5 seconds between tasks to prevent queue conflicts
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log(`\n=== GENERATION SUMMARY ===`);
  console.log(`Total processed: ${jobs.length}`);
  console.log(`Successful:     ${successCount}`);
  console.log(`Failed:         ${failCount}`);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
