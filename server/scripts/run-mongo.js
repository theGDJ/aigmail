import { MongoMemoryReplSet } from 'mongodb-memory-server';

async function start() {
  console.log('Starting local in-memory MongoDB replica set on port 27017...');
  try {
    const replSet = await MongoMemoryReplSet.create({
      replSet: {
        count: 1,
        storageEngine: 'wiredTiger',
      },
      instanceOpts: [
        {
          port: 27017,
          dbName: 'ai_mail_summarizer',
        },
      ],
    });
    const uri = replSet.getUri('ai_mail_summarizer');
    console.log(`\n✅ Local MongoDB replica set is running at:\n${uri}\n`);
    
    // Keep alive
    process.on('SIGINT', async () => {
      await replSet.stop();
      process.exit(0);
    });
  } catch (err) {
    console.error('Failed to start MongoMemoryReplSet:', err);
    process.exit(1);
  }
}

start();
