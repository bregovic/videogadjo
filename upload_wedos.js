const ftp = require("basic-ftp");
const path = require("path");

async function upload() {
    const client = new ftp.Client();
    client.ftp.verbose = true;

    try {
        await client.access({
            host: "372733.w33.wedos.net",
            user: "w372733",
            password: "Starter123!",
            secure: false
        });

        console.log("Connected to FTP");

        // Create videogadjo directory
        await client.ensureDir("www/videogadjo");

        // Upload the wedos landing page
        await client.uploadFromDir(path.join(__dirname, "wedos"));

        console.log("Upload successful!");
        console.log("VideoGadjo landing page is now at: https://tvoje-domena.cz/videogadjo/");
    } catch (err) {
        console.error("Upload failed:", err);
    }
    client.close();
}

upload();
