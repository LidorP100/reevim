package com.reevim.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private const val URL_TERMS   = "https://LidorP100.github.io/reevim/terms.html"
private const val URL_PRIVACY = "https://LidorP100.github.io/reevim/privacy-policy.html"

private data class OnboardingPage(
    val emoji: String,
    val title: String,
    val subtitle: String,
    val description: String,
)

private val pages = listOf(
    OnboardingPage(
        emoji = "🍽",
        title = "ברוכים הבאים",
        subtitle = "לרעבים",
        description = "האפליקציה שעוזרת לך למצוא את המסעדות הטובות ביותר בסביבתך — מהר, בקלות ובחינם.",
    ),
    OnboardingPage(
        emoji = "📍",
        title = "מסעדות",
        subtitle = "בסביבתך",
        description = "אנחנו משתמשים במיקום שלך כדי להציג מסעדות קרובות, מרחק בק\"מ ושעות פתיחה עדכניות.",
    ),
    OnboardingPage(
        emoji = "🎯",
        title = "התאם",
        subtitle = "לטעם שלך",
        description = "סנן לפי כשר, בשרי, חלבי, טבעוני ועוד. מיין לפי דירוג, מרחק או מחיר — הכל בשבילך.",
    ),
)

@Composable
fun OnboardingScreen(onFinish: () -> Unit) {
    var currentPage by remember { mutableIntStateOf(0) }
    var termsAccepted by remember { mutableStateOf(false) }
    val context = LocalContext.current

    val gradient = Brush.linearGradient(
        colors = listOf(Color(0xFFFF6B2B), Color(0xFFFFB347)),
        start = Offset(0f, 0f),
        end = Offset(400f, 400f),
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background),
    ) {
        // אזור תוכן — ממלא את השטח הנותר
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            AnimatedContent(
                targetState = currentPage,
                transitionSpec = {
                    (slideInHorizontally { -it } + fadeIn()) togetherWith (slideOutHorizontally { it } + fadeOut())
                },
                label = "onboarding_page",
            ) { idx ->
                val p = pages[idx]
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 32.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .size(110.dp)
                            .clip(CircleShape)
                            .background(brush = gradient),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(p.emoji, fontSize = 50.sp)
                    }

                    Spacer(modifier = Modifier.height(28.dp))

                    Text(
                        p.title,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary,
                        letterSpacing = 3.sp,
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        p.subtitle,
                        fontSize = 30.sp,
                        fontWeight = FontWeight.Black,
                        color = MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        p.description,
                        fontSize = 14.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                        lineHeight = 22.sp,
                    )
                }
            }
        }

        // תחתית — נקודות + אישור תנאים + כפתורים
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            // נקודות אינדיקטור
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                pages.forEachIndexed { idx, _ ->
                    Box(
                        modifier = Modifier
                            .clip(CircleShape)
                            .size(if (idx == currentPage) 24.dp else 8.dp, 8.dp)
                            .background(
                                if (idx == currentPage) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outline
                            )
                    )
                }
            }

            // אישור תנאים (דף אחרון בלבד)
            if (currentPage == pages.lastIndex) {
                val primary = MaterialTheme.colorScheme.primary
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { termsAccepted = !termsAccepted }
                        .padding(horizontal = 4.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        buildAnnotatedString {
                            append("קראתי ומסכים/ה ל")
                            pushStringAnnotation("terms", URL_TERMS)
                            withStyle(SpanStyle(color = primary, textDecoration = TextDecoration.Underline)) {
                                append("תנאי השימוש")
                            }
                            pop()
                            append(" ו")
                            pushStringAnnotation("privacy", URL_PRIVACY)
                            withStyle(SpanStyle(color = primary, textDecoration = TextDecoration.Underline)) {
                                append("מדיניות הפרטיות")
                            }
                            pop()
                        },
                        fontSize = 13.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.weight(1f),
                    )
                    Checkbox(
                        checked = termsAccepted,
                        onCheckedChange = null,
                        colors = CheckboxDefaults.colors(checkedColor = primary),
                    )
                }
            }

            // כפתורים
            if (currentPage < pages.lastIndex) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    TextButton(onClick = { currentPage = pages.lastIndex }) {
                        Text("דלג", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                    }
                    Button(
                        onClick = { currentPage++ },
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                        modifier = Modifier.height(48.dp).width(130.dp),
                    ) {
                        Text("הבא", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    }
                }
            } else {
                Button(
                    onClick = onFinish,
                    enabled = termsAccepted,
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                ) {
                    Text("בואו נתחיל! 🍽", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    }
}
