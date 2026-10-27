const fs = require("fs");
const path = require("path");

// Load notes directly from electricity_notes.md
let electricityContent = "";
try {
    electricityContent = fs.readFileSync(path.join(__dirname, "electricity_notes.md"), "utf8");
} catch (err) {
    console.error("Error reading electricity_notes.md:", err.message);
}

const SAMPLE_TOPICS = {
    electricity: {
        id: "electricity",
        title: "Electricity: Complete Study Notes",
        subject: "Physics (Class 10 Level)",
        pages: 6,
        summary: "Comprehensive study notes covering electric charge, current, Ohm's law, resistance, series/parallel circuits, Joule heating, electric power, and common misconceptions.",
        content: electricityContent,
        demoQuestions: {
            supported: {
                question: "What does Ohm's law state, and what physical quantity does the slope of the voltage versus current graph represent?",
                expectedEvidenceFragment: "Ohm's law states that the current flowing through a conductor is directly proportional to the potential difference across the conductor, provided the temperature and other physical conditions remain constant. The slope of the voltage versus current graph gives the resistance of the conductor.",
                section: "Section 6: Ohm's Law"
            },
            unsupported: {
                question: "What is the maximum lifespan of Drosophila melanogaster fruit flies when fed on a sucrose-restricted diet?",
                reason: "The notes strictly cover electric charges, circuits, Ohm's law, resistance, and domestic electricity. They contain no biological data about Drosophila fruit flies or dietary lifespan."
            }
        }
    }
};

module.exports = { SAMPLE_TOPICS };

