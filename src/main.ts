import {Command} from "commander"
import * as puppeteer from "puppeteer"
import fs from "fs-extra"
import path from "path"

import delay from "@/utils/delay"

async function createDirIfNotExists(dirpath: string){
    try {
        await fs.access(dirpath, fs.constants.F_OK);
    } catch (error) {
        // Folder doesn't exist, create it
        await fs.mkdir(dirpath, { recursive: true });
    }
}

async function clearDirectory(dirPath: string) {
    try {
        const files = await fs.readdir(dirPath);

        for (const file of files) {
            const filePath = `${dirPath}/${file}`;
            const stats = await fs.stat(filePath);

            if (stats.isDirectory()) {
                // Recursively clear subdirectory
                await clearDirectory(filePath);
                // Remove the empty directory after clearing its contents
                await fs.rmdir(filePath);
            } else {
                // Remove file
                await fs.unlink(filePath);
            }
        }

        console.log(`Directory ${dirPath} cleared successfully.`);
    } catch (error) {
        console.error(`Error clearing directory ${dirPath}:`, error);
    }
}

function convertURLToSafeString(url: string) {
    // Replace characters not allowed in file names with underscores
    return url.replace(/[^\w\d.]+/g, '_');
}

async function screenshotDivOrIframe(
  divHandle: puppeteer.ElementHandle<Element>,
  page: puppeteer.Page,
  filePath: string,
) {
  // Check for an iframe within the div handle
  const iframeHandle = await divHandle.$("iframe");

  if (iframeHandle) {
    // If an iframe is found, get its src URL
    const iframeSrc = await (
      await iframeHandle.getProperty("src")
    ).jsonValue<string>();

    if (iframeSrc) {
        await divHandle.screenshot({
            path: filePath
        })
        const diagramFilepath = filePath.replace(/(\/|\\)(.*?)\.png$/,"$1$2-diagram.png")
      // Open the iframe URL in a new tab
      const newTab = await page.browser().newPage();
      await newTab.goto(iframeSrc);
      await delay(1000)
      await newTab.waitForSelector("#load-loading", {hidden: true})
    await delay(2500)
        
      // Take a screenshot of the iframe content and save it to the specified filePath
        await newTab.screenshot({ path: diagramFilepath });

      // Close the new tab
      await newTab.close();
    }
  } else {
    // If no iframe is found, take a screenshot of the div itself and save it to the specified filePath
    await divHandle.screenshot({ path: filePath });
  }
}

/**
 * Runs a specified procedure for each div in the page that has attribute `data-lookup="contents-block`
 * Loops through the divs in a way that respects scrolling and dynamic loading (e.g. intersection observer api or scroll event listeners)
 */
async function processContentBlocks(
    page: puppeteer.Page,
    actionCallback: (div: puppeteer.ElementHandle<Element>) => Promise<void>
    ) {
    let lastScrollTop = 0
    const getScrollTop = async ()=>await page.evaluate(()=>{
        return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
    })
    while (true) {
        const div = await page.$('div[data-lookup="contents-block"]:not([data-touched-puppet="true"])');
        if (!div) {
            console.log('No more unprocessed divs found. Ending loop.');
            break
        }
        
        await page.evaluate((div)=>{
            div.scrollIntoView({
                behavior:"smooth",
                block:"center"
            })
            },div)
        
        const st = await getScrollTop()
        
        if(st < lastScrollTop){
            console.log("accidental revert due to dynamic content loading")
            break
        }

        // Perform the asynchronous operation defined by actionCallback
        await actionCallback(div);

        // Mark the div as processed
        await div.evaluate(el => el.setAttribute('data-touched-puppet', 'true'))
        
        lastScrollTop = await getScrollTop()
        
        // Attempt to wait up to 5 seconds for another unprocessed div to appear
        try {
            await page.waitForSelector('div[data-lookup="contents-block"]:not([data-touched-puppet="true"])', { timeout: 5000 });
        } catch (error) {
            console.log('Timed out waiting for the next unprocessed div. Ending loop.');
            break;
        }
    }
}

async function main(url: string){
    
    const imageDir = path.join("captures",convertURLToSafeString(url))
    
    await createDirIfNotExists(imageDir)
    
    await clearDirectory(imageDir)
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ["--start-maximized"]
    })
    const page = await browser.newPage()
    await page.goto(url)
    
    try {
        await page.waitForSelector('#onetrust-accept-btn-handler', { timeout: 3000 });
        await page.click('#onetrust-accept-btn-handler');
        console.log('Clicked on "Accept Cookies" button.');
    } catch (error) {
        console.log('The "Accept Cookies" button did not appear within 3 seconds.')
    }
    
    await page.waitForSelector('div[data-lookup="design-container"]')
    
    await delay(3000)
    
    let icount = 0
    
    await processContentBlocks(page,async (div)=>{
        await delay(1000)
        const filePath = path.join(imageDir,`${icount}.png`)
        await screenshotDivOrIframe(div,page,filePath)
        icount++
    })
    
    await browser.close()
}

const program = new Command()

program.argument("<url>").action(main)

program.parse(process.argv)