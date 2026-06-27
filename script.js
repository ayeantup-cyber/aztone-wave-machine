const folderButton = document.getElementById("folderButton");
const status = document.querySelector(".status");
const sampleList = document.getElementById("sampleList");

folderButton.addEventListener("click", async () => {

    if (!window.showDirectoryPicker) {

        status.textContent =
            "Folder access isn't supported by this browser yet.";

        return;
    }

    try {

        const directory = await window.showDirectoryPicker();

        status.textContent =
            "📁 " + directory.name;

        sampleList.innerHTML = "";

        for await (const entry of directory.values()) {

            if (
                entry.kind === "file" &&
                /\.(wav|mp3|ogg)$/i.test(entry.name)
            ) {

                const card = document.createElement("div");
                card.className = "sample";

                card.innerHTML = `
                    <strong>${entry.name}</strong>
                    <br><br>
                    <button disabled>▶ Preview</button>
                    <button disabled>■ Stop</button>
                `;

                sampleList.appendChild(card);

            }

        }

    } catch (err) {

        status.textContent =
            "Folder selection cancelled.";

    }

});
