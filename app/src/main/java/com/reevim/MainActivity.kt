package com.reevim

import android.Manifest
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.reevim.data.repository.ThemePreferences
import com.reevim.ui.screens.FavoritesScreen
import com.reevim.ui.screens.LoginScreen
import com.reevim.ui.screens.MapScreen
import com.reevim.ui.screens.HomeScreen
import com.reevim.ui.screens.OnboardingScreen
import com.reevim.ui.screens.ProfileScreen
import com.reevim.ui.screens.SurpriseScreen
import com.reevim.ui.theme.ReevimTheme
import com.reevim.ui.viewmodel.AuthViewModel
import com.reevim.ui.viewmodel.HomeViewModel
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private var homeViewModelRef: HomeViewModel? = null

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (grants[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true) {
            homeViewModelRef?.tryStartLocationUpdates()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestPermissionLauncher.launch(
            arrayOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            )
        )

        enableEdgeToEdge()
        setContent {
            val context = LocalContext.current
            val scope = rememberCoroutineScope()
            val isDarkTheme by ThemePreferences.isDarkMode(context).collectAsStateWithLifecycle(initialValue = true)
            val hasSeenOnboarding by ThemePreferences.hasSeenOnboarding(context).collectAsStateWithLifecycle(initialValue = true)
            val authViewModel: AuthViewModel = viewModel()
            val user by authViewModel.user.collectAsStateWithLifecycle()

            ReevimTheme(darkTheme = isDarkTheme) {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    when {
                        !hasSeenOnboarding -> {
                            OnboardingScreen(onFinish = {
                                scope.launch { ThemePreferences.setSeenOnboarding(context) }
                            })
                        }
                        user == null -> {
                            LoginScreen(viewModel = authViewModel, onLoggedIn = {})
                        }
                        else -> {
                            MainAppScaffold(
                                authViewModel = authViewModel,
                                isDarkTheme = isDarkTheme,
                                onThemeToggle = { scope.launch { ThemePreferences.setDarkMode(context, !isDarkTheme) } },
                                onHomeViewModelCreated = { homeViewModelRef = it }
                            )
                        }
                    }
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        homeViewModelRef?.tryStartLocationUpdates()
    }

    override fun onPause() {
        super.onPause()
        homeViewModelRef?.pauseLocationUpdates()
    }
}

@Composable
fun MainAppScaffold(
    authViewModel: AuthViewModel,
    isDarkTheme: Boolean,
    onThemeToggle: () -> Unit,
    onHomeViewModelCreated: (HomeViewModel) -> Unit = {}
) {
    val navController = rememberNavController()
    val homeViewModel: HomeViewModel = viewModel()

    LaunchedEffect(homeViewModel) {
        onHomeViewModelCreated(homeViewModel)
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            val navBackStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = navBackStackEntry?.destination

            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 0.dp
            ) {
                val items = listOf(
                    Triple("home",      "בית",    Icons.Default.Home),
                    Triple("surprise",  "הפתע",   Icons.Default.Casino),
                    Triple("map",       "מפה",    Icons.Default.Map),
                    Triple("favorites", "שמורות", Icons.Default.Favorite),
                    Triple("profile",   "פרופיל", Icons.Default.Person),
                )

                items.forEach { (route, label, icon) ->
                    val isSelected = currentDestination?.hierarchy?.any { it.route == route } == true
                    NavigationBarItem(
                        icon = { Icon(icon, contentDescription = label) },
                        label = { Text(label) },
                        selected = isSelected,
                        onClick = {
                            navController.navigate(route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            indicatorColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(innerPadding)
        ) {
            composable("home") {
                HomeScreen(
                    viewModel = homeViewModel,
                    darkTheme = isDarkTheme,
                    onThemeToggle = onThemeToggle
                )
            }
            composable("map")       { MapScreen(viewModel = homeViewModel) }
            composable("surprise")  { SurpriseScreen(viewModel = homeViewModel) }
            composable("favorites") { FavoritesScreen(viewModel = homeViewModel) }
            composable("profile") {
                ProfileScreen(viewModel = authViewModel, onLoggedOut = {
                    navController.navigate("home") {
                        popUpTo(0) { inclusive = true }
                    }
                })
            }
        }
    }
}
