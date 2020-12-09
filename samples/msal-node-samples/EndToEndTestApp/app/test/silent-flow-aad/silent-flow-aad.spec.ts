import "jest";
import puppeteer from "puppeteer";
import { Screenshot, createFolder, setupCredentials } from "../../../../../e2eTestUtils/TestUtils";
import { NodeCacheTestUtils } from "../../../../../e2eTestUtils/NodeCacheTestUtils";
import { LabClient } from "../../../../../e2eTestUtils/LabClient";
import { LabApiQueryParams } from "../../../../../e2eTestUtils/LabApiQueryParams";
import { AppTypes, AzureEnvironments } from "../../../../../e2eTestUtils/Constants";
import { clickSignIn, enterCredentials } from "../testUtils";

const SCREENSHOT_BASE_FOLDER_NAME = `${__dirname}/screenshots`;
const SAMPLE_HOME_URL = 'http://localhost:3000/';
const TEST_CACHE_LOCATION = `${__dirname}/data/testCache.json`;
const SUCCESSFUL_GRAPH_CALL_ID = "graph-called-successfully";

let username: string;
let accountPwd: string;

describe('Silent Flow AAD PPE Tests', () => {
    jest.setTimeout(60000);
    let browser: puppeteer.Browser;

    beforeAll(async () => {
        createFolder(SCREENSHOT_BASE_FOLDER_NAME);
        const labApiParms: LabApiQueryParams = {
            azureEnvironment: AzureEnvironments.PPE,
            appType: AppTypes.CLOUD
        }

        const labClient = new LabClient();
        const envResponse = await labClient.getVarsByCloudEnvironment(labApiParms);
        [username, accountPwd] = await setupCredentials(envResponse[0], labClient);

        browser = await puppeteer.launch({
            headless: true,
            ignoreDefaultArgs: ['--no-sandbox', '-disable-setuid-sandbox', '--disable-extensions']
        });
    })

    let context: puppeteer.BrowserContext;
    let page: puppeteer.Page;

    afterAll(async () => {
        await browser.close();
    });

    describe("Acquire Token", () => {
        let testName: string;
        let screenshot: Screenshot;

        beforeAll(async() => {
            testName = "silentFlowBaseCase";
            screenshot = new Screenshot(`${SCREENSHOT_BASE_FOLDER_NAME}/${testName}`);
        });

        describe("Authenticated", () => {
            beforeEach(async () => {
                context = await browser.createIncognitoBrowserContext();
                page = await context.newPage();
                page.setDefaultNavigationTimeout(0);
                await page.goto(SAMPLE_HOME_URL);
                await clickSignIn(page, screenshot);
                await enterCredentials(page, screenshot, username, accountPwd);
            });
        
            afterEach(async () => {
                await page.close();
                await context.close();
                NodeCacheTestUtils.resetCache(TEST_CACHE_LOCATION);
            });
    
            it("Performs acquire token with Auth Code flow", async () => {
                await page.waitForSelector("#acquireTokenSilent");
                const cachedTokens = NodeCacheTestUtils.getTokens(TEST_CACHE_LOCATION);
                expect(cachedTokens.accessTokens.length).toBe(1);
                expect(cachedTokens.idTokens.length).toBe(1);
                expect(cachedTokens.refreshTokens.length).toBe(1);
            });
    
            it("Performs acquire token silent", async () => {
                await page.waitForSelector("#acquireTokenSilent");
                await page.click("#acquireTokenSilent");
                await page.waitForSelector("#graph-called-successfully");
                await screenshot.takeScreenshot(page, "acquireTokenSilentGotTokens");
                const htmlBody = await page.evaluate(() => document.body.innerHTML);
                expect(htmlBody).toContain(SUCCESSFUL_GRAPH_CALL_ID);
            });

            it("Refreshes an expired access token", async () => {
                await page.waitForSelector("#acquireTokenSilent");
                const originalTokenExpiration = Number(NodeCacheTestUtils.getAccessTokens(TEST_CACHE_LOCATION)[0].token.expiresOn);
                NodeCacheTestUtils.expireAccessTokens(TEST_CACHE_LOCATION);
                const expiredTokenExpiration = Number(NodeCacheTestUtils.getAccessTokens(TEST_CACHE_LOCATION)[0].token.expiresOn);
                await page.click("#acquireTokenSilent");
                await page.waitForSelector(`#${SUCCESSFUL_GRAPH_CALL_ID}`);
                const refreshedTokenExpiration = Number(NodeCacheTestUtils.getAccessTokens(TEST_CACHE_LOCATION)[0].token.expiresOn);
                await screenshot.takeScreenshot(page, "acquireTokenSilentGotTokens");
                const htmlBody = await page.evaluate(() => document.body.innerHTML);
                expect(htmlBody).toContain(SUCCESSFUL_GRAPH_CALL_ID);
                expect(originalTokenExpiration).toBeGreaterThan(0);
                expect(expiredTokenExpiration).toBe(0);
                expect(refreshedTokenExpiration).toBeGreaterThan(originalTokenExpiration);
            });
        });
    });
});