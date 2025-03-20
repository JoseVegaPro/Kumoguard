document.addEventListener("DOMContentLoaded", function () {
    const messages = [
        "Kindness is not Weakness.",
        "Patience is not Weakness.",
        "Strength comes from GOD",
        "Waiting means preparation",
        "TRUST IN HIM",
    ];
    let messageIndex = 0;
    let i = 0;
    const typewriterElement = document.getElementById("typewriter");

    // Particle Effect Setup
    const canvas = document.getElementById("particles");
    const ctx = canvas.getContext("2d");
    let particles = [];

    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    function createParticles(count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                radius: Math.random() * 3 + 1,
                dx: (Math.random() - 0.5) * 2,
                dy: (Math.random() - 0.5) * 2
            });
        }
    }

    function drawParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";

        particles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function updateParticles() {
        const textRect = typewriterElement.getBoundingClientRect();

        particles.forEach(p => {
            p.x += p.dx;
            p.y += p.dy;

            if (p.x < 0 || p.x > canvas.width) p.dx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.dy *= -1;

            // If particle is near the text, push it away instead of reversing direction
            const distanceX = (p.x - (textRect.left + textRect.right) / 2);
            const distanceY = (p.y - (textRect.top + textRect.bottom) / 2);
            const distance = Math.sqrt(distanceX ** 2 + distanceY ** 2);

            if (distance < 50) { // If within 50px of the text
                p.dx += distanceX * 0.001; // Small force push
                p.dy += distanceY * 0.001;
            }
        });
    }

    function animateParticles() {
        drawParticles();
        updateParticles();
        requestAnimationFrame(animateParticles);
    }

    createParticles(100);
    animateParticles();

    function typeWriter() {
        if (i < messages[messageIndex].length) {
            let span = document.createElement("span");
            span.textContent = messages[messageIndex].charAt(i);
            typewriterElement.appendChild(span);

            // Apply the glow effect
            setTimeout(() => {
                span.classList.add("glow");
            }, 10); // Small delay for effect

            i++;
            let randomSpeed = Math.random() * 50 + 80; // Random between 80ms and 130ms
            setTimeout(typeWriter, randomSpeed);
        } else {
            setTimeout(deleteText, 2000); // Wait before deleting
        }
    }

    function deleteText() {
        if (i >= 0) {
            typewriterElement.textContent = messages[messageIndex].substring(0, i);
            i--;
            setTimeout(deleteText, 50);
        } else {
            messageIndex = (messageIndex + 1) % messages.length;
            i = 0;
            setTimeout(typeWriter, 500); // Pause before retyping
        }
    }

    typeWriter();
});
