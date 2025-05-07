import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import fetch from 'node-fetch';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import readline from 'readline'; // استيراد مكتبة readline
import googleTTS from 'google-tts-api'; // مكتبة تحويل النص إلى كلام
import ffmpegPath from 'ffmpeg-static'; // مسار ffmpeg
import ffmpeg from 'fluent-ffmpeg'; // مكتبة استخدام ffmpeg

const { Client, LocalAuth, MessageMedia } = pkg;

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "whatsapp-bot" })
});

const API_KEY = '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'; // تأكد من أن مفتاح API صحيح

// إعداد readline للاستماع للأوامر في التيرمينال
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

ffmpeg.setFfmpegPath(ffmpegPath); // تعيين مسار ffmpeg

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('Scan the QR code to log in');
});

client.on('ready', () => {
  console.log('Bot is ready!');

  // إضافة الحدث للاستماع إلى الضغط على "r" في التيرمينال
  rl.on('line', (input) => {
    if (input === 'r') {
      console.log('Restarting bot...');
      client.destroy().then(() => {
        client.initialize(); // إعادة تشغيل البوت
      });
    }
  });
});

// اختيار الموديل بناءً على الأمر
const getModelUrl = (command) => {
  switch (command) {
    case '/ask':
      return 'https://api-inference.huggingface.co/models/distilgpt2'; // GPT-2 صغير
    case '/ask1':
      return 'https://api-inference.huggingface.co/models/gpt2'; // GPT-2
    case '/ask2':
      return 'https://api-inference.huggingface.co/models/QwQ'; // QwQ-32B-Preview
    case '/ask3':
      return 'https://api-inference.huggingface.co/models/distilbert-base-uncased'; // DistilBERT
    default:
      return null;
  }
};

client.on('message', async message => {
  // الرد على الرسائل النصية باستخدام Hugging Face
  if (message.body.startsWith('/ask') || message.body.startsWith('/ask1') || message.body.startsWith('/ask2') || message.body.startsWith('/ask3')) {
    const userMessage = message.body.split(' ').slice(1).join(' ').trim();
    const command = message.body.split(' ')[0]; // استخراج الأمر (مثل /ask أو /ask1)

    if (!userMessage) {
      message.reply('يرجى كتابة سؤال بعد الأمر.');
      return;
    }

    console.log('Received message:', userMessage);

    const modelUrl = getModelUrl(command); // الحصول على رابط الموديل بناءً على الأمر

    if (!modelUrl) {
      message.reply('هذا الأمر غير مدعوم حاليًا.');
      return;
    }

    try {
      const response = await fetch(modelUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: userMessage })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error response from Hugging Face:', errorData);
        throw new Error('Error in translation request');
      }

      const result = await response.json();
      const botReply = result?.[0]?.generated_text || "لم أتمكن من الرد.";
      console.log('Bot reply:', botReply);

      message.reply(botReply);
    } catch (error) {
      console.error('Error with translation API:', error);
      message.reply('حدث خطأ أثناء معالجة طلبك.');
    }
  }

  // تحويل النص إلى صوت عند استخدام /voice
  if (message.body.startsWith('/voice')) {
    const text = message.body.replace('/voice', '').trim(); // استخراج النص بعد /voice
    if (!text) {
      message.reply('يرجى إدخال نص بعد الأمر /voice.');
      return;
    }

    try {
      // تحويل النص إلى صوت باستخدام googleTTS مع تحديد صوت الرجل
      const url = googleTTS.getAudioUrl(text, {
        lang: 'ar',
        slow: false,
        host: 'https://translate.google.com',
        voice: 'male' // استخدام صوت رجل
      });

      // تحميل الصوت
      const audioPath = path.resolve(`./audio_${Date.now()}.mp3`);
      const audioResponse = await fetch(url);
      const audioBuffer = await audioResponse.arrayBuffer(); // استخدم arrayBuffer بدلاً من buffer
      await fs.writeFile(audioPath, Buffer.from(audioBuffer));

      // إرسال الصوت عبر WhatsApp
      const audioMedia = MessageMedia.fromFilePath(audioPath);
      await client.sendMessage(message.from, audioMedia);

      // حذف الملف المؤقت بعد الإرسال
      await fs.unlink(audioPath);
      console.log('Audio sent successfully!');
    } catch (error) {
      console.error('Error generating voice:', error);
      message.reply('حدث خطأ أثناء تحويل النص إلى صوت.');
    }
  }

  // تحويل صورة إلى ملصق
  if (message.hasMedia && message.body.startsWith('/img')) {
    try {
      const media = await message.downloadMedia();

      if (!media) {
        message.reply('تعذر تحميل الوسائط.');
        return;
      }

      const imgBuffer = Buffer.from(media.data, 'base64');
      const outputPath = path.resolve(`./sticker_${Date.now()}.webp`);

      await sharp(imgBuffer)
        .resize(512, 512)  // إعادة الحجم إلى 512x512
        .webp({ quality: 80 }) // تحويل إلى WebP مع جودة 80
        .toFile(outputPath);

      const stickerMedia = MessageMedia.fromFilePath(outputPath);

      await client.sendMessage(message.from, stickerMedia, { sendMediaAsSticker: true });
      console.log('Sticker sent successfully!');

      await fs.unlink(outputPath); // حذف الملف المؤقت بعد إرساله
    } catch (error) {
      console.error('Error creating sticker:', error);
      message.reply('تعذر تحويل الصورة إلى ملصق.');
    }
  }

  // تحويل النص إلى فيديو عند استخدام /ttv
  if (message.body.startsWith('/ttv')) {
    const text = message.body.replace('/ttv', '').trim();
    if (!text) {
      message.reply('يرجى إدخال نص بعد الأمر /ttv.');
      return;
    }

    try {
      // تحويل النص إلى كلام باستخدام googleTTS
      const url = googleTTS.getAudioUrl(text, {
        lang: 'ar',
        slow: false,
        host: 'https://translate.google.com',
      });

      // تحميل الصوت
      const audioPath = path.resolve(`./audio_${Date.now()}.mp3`);
      const audioResponse = await fetch(url);
      const audioBuffer = await audioResponse.arrayBuffer(); // استخدم arrayBuffer بدلاً من buffer
      await fs.writeFile(audioPath, Buffer.from(audioBuffer));

      // التحقق من وجود صورة الخلفية
      const imagePath = path.resolve('./background.jpg'); // تأكد من وجود هذه الصورة في نفس المجلد
      try {
        await fs.access(imagePath); // تأكد من أن الصورة موجودة
      } catch (err) {
        message.reply('صورة الخلفية مفقودة.');
        return;
      }

      // تحويل الصوت إلى فيديو باستخدام ffmpeg
      const videoPath = path.resolve(`./video_${Date.now()}.mp4`);

      ffmpeg()
        .input(audioPath)
        .input(imagePath)
        .loop(5) // تحديد مدة الفيديو (5 ثواني)
        .output(videoPath)
        .audioCodec('aac')
        .videoCodec('libx264')
        .on('end', async () => {
          console.log('Video created successfully!');
          // إرسال الفيديو عبر WhatsApp
          const videoMedia = MessageMedia.fromFilePath(videoPath);
          await client.sendMessage(message.from, videoMedia);
          // حذف الملفات المؤقتة
          await fs.unlink(audioPath);
          await fs.unlink(videoPath);
        })
        .on('error', (err) => {
          console.error('Error creating video:', err);
          message.reply('حدث خطأ أثناء تحويل النص إلى فيديو.');
        })
        .run();
    } catch (error) {
      console.error('Error generating video:', error);
      message.reply('حدث خطأ أثناء تحويل النص إلى فيديو.');
    }
  }

  // تحويل الملصق العادي إلى صورة عند الرد عليه بـ "/gmi"
  if (message.body === '/gmi' && message.hasQuotedMsg) {
    try {
      const quotedMsg = await message.getQuotedMessage();

      if (!quotedMsg.hasMedia) {
        message.reply('الرسالة المقتبسة ليست ملصقًا.');
        return;
      }

      const media = await quotedMsg.downloadMedia();

      if (!media) {
        message.reply('تعذر تحميل الوسائط.');
        return;
      }

      // التحقق إذا كان الملصق عاديًا (ليس متحركًا)
      if (media.mimetype === 'image/webp') {
        const imgBuffer = Buffer.from(media.data, 'base64');
        const outputPath = path.resolve(`./image_${Date.now()}.jpg`);

        await sharp(imgBuffer)
          .toFile(outputPath);

        const imgMedia = MessageMedia.fromFilePath(outputPath);
        await client.sendMessage(message.from, imgMedia);
        console.log('Sticker converted to image and sent successfully!');

        await fs.unlink(outputPath); // حذف الملف المؤقت بعد إرساله
      } else {
        message.reply('الملصق المقتبس ليس ملصقًا عاديًا.');
      }
    } catch (error) {
      console.error('Error converting sticker to image:', error);
      message.reply('تعذر تحويل الملصق إلى صورة.');
    }
  }

  // تحويل الملصق المتحرك إلى صورة متحركة عند الرد عليه بـ "/متحرك"
  if (message.body === '/متحرك' && message.hasQuotedMsg) {
    try {
      const quotedMsg = await message.getQuotedMessage();

      if (!quotedMsg.hasMedia) {
        message.reply('الرسالة المقتبسة ليست ملصقًا.');
        return;
      }

      const media = await quotedMsg.downloadMedia();

      if (!media) {
        message.reply('تعذر تحميل الوسائط.');
        return;
      }

      if (media.mimetype === 'image/gif') {
        const gifBuffer = Buffer.from(media.data, 'base64');
        const outputPath = path.resolve(`./gif_${Date.now()}.gif`);

        await fs.writeFile(outputPath, gifBuffer);
        const gifMedia = MessageMedia.fromFilePath(outputPath);

        await client.sendMessage(message.from, gifMedia);
        console.log('Sticker converted to gif and sent successfully!');

        await fs.unlink(outputPath); // حذف الملف المؤقت بعد إرساله
      } else {
        message.reply('الملصق المقتبس ليس ملصقًا متحركًا.');
      }
    } catch (error) {
      console.error('Error converting sticker to gif:', error);
      message.reply('تعذر تحويل الملصق إلى صورة متحركة.');
    }
  }
});

client.initialize();
