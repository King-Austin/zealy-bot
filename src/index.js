import puppeteer from "@cloudflare/puppeteer";

export default {
  async scheduled(event, env, ctx) {
    // 1. Launch Browser & Scrape
    const browser = await puppeteer.launch(env.MY_BROWSER);
    const page = await browser.newPage();
    await page.goto("https://zealy.io/cw/wintersupercycle/questboard/sprints");
    await page.waitForSelector('div[role="button"]', { timeout: 10000 });
    
    const currentQuestsText = await page.evaluate(() => document.body.innerText);
    await browser.close();

    // 2. Fetch Previous State from Database
    const previousQuests = await env.ZEALY_KV.get("last_scrape");

    // 3. Use Gemini to Compare and Alert
    const prompt = `
      You are a specialized Zealy task monitor. 
      PREVIOUS DATA: ${previousQuests || "None"}
      CURRENT DATA: ${currentQuestsText.substring(0, 4000)}
      
      Tasks: 
      1. Identify if any NEW tasks have appeared.
      2. If new tasks exist, list them with XP.
      3. Return ONLY a JSON object: {"new_tasks_found": true/false, "new_tasks": []}
    `;

    const geminiResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const result = await geminiResp.json();
    const analysis = JSON.parse(result.candidates[0].content.parts[0].text);

    // 4. Action: Update DB and Notify if changed
    if (analysis.new_tasks_found) {
      console.log("New tasks detected!", analysis.new_tasks);
      // Optional: Insert Discord Webhook fetch() here to get a notification on your phone
      await env.ZEALY_KV.put("last_scrape", currentQuestsText);
    }
  }
};