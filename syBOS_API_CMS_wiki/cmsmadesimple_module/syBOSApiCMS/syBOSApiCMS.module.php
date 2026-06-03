<?php
/**
 *
 *  NOTES FOR THE ASPIRING, UNEXPERIENCED, OR FORGETFUL MODULE DEVELOPER
 *
 * As one of the latter, I put together these notes to help me when I need
 * to start work on a new module. I take this Skeleton file, delete most of
 * the comments, and customize it to do whatever it is I need done.
 *
 * Keep in mind that the module interface has a huge number of hooks
 * available to control many, many aspects of how CMS Made Simple works.
 * This module does not even begin to scratch the surface, except,
 * perhaps, as an example of a "plug-in" type module. There are
 * many functional hooks for modifying users, groups, content, templates,
 * global content blocks, on insertion, deletion, change, and much, much more.
 * For the definitive list of these functions, look at the base class:
 * 
 * CMS_ROOT/lib/classes/class.module.inc.php
 * 
 * It's good readin', and it tells you everything you need to know. I
 * learn something new every time I look at it.
 * 
 * Furthermore, when this Skeleton module was started, there was a paucity
 * of documentation on the CMS Made Simple site. This is no longer the
 * case. Automatic API documentation can be found at
 * http://cmsmadesimple.org/apidoc/CMS/CMSModule.html
 *
 * Also, a continuously improving documentation project can be found
 * at http://wiki.cmsmadesimple.org/index.php/Creating_Modules
 * 
 * 1. Directory Structure
 * ----------------------
 * 
 * Underneath this current directory, there are "lang" and "templates"
 * directories. The magic of the CMS module interface system is such
 * that files within those directories are automatically available to
 * your module, particularly when it comes to localization and
 * smarty templates.
 * 
 * 2. Localization
 * ---------------
 * 
 * In the "lang" directory, you can create your language files.
 * Note that the newest structure involves a directory per language,
 * with the default language in the top level, so, for example,
 * if you're writing the module in US English, your US English
 * language files would be in lang/en_US.php, while your
 * Swedish language files would be in lang/ext/sv_SE.php.
 * 
 * Read more about localization at
 * http://wiki.cmsmadesimple.org/index.php/Creating_Modules#Enable_translations_from_the_Translation_Center
 * 
 * For each localized word, create an entry in that file of the form:
 * 
 * $lang['word'] = 'Localized Version of Word';
 * 
 * Now, withing your module, any time you want a localized version of the
 * word, you simply refer to:
 *
 * $this->Lang('word')
 * 
 * Substitution is also possible for your localized phrase. Say you want to
 * include a number in a string. You could then use syntax like:
 * 
 * $lang['number_phrase'] = 'Localized Version has %s numbers.';
 * 
 * and in your code, refer to 
 * 
 * $this->Lang('number_phrase', $number)
 * 
 * where the value of the variable $number will replace the %s in
 * the localized string.
 * 
 * 3. Templates
 * ------------
 * 
 * Smarty is built-in to the module API. Templates are assumed to be in the
 * "templates" directory of the module. See the DisplayAdminPrefs method
 * below (or the file method.admin_prefs.php).
 * 
 * Nowadays its better to create templates in the database so you can give
 * users the ability to modify templates as they wish. Take a look at News
 * module to get picture of how its done.
 * 
 * 4. Admin Icons
 * --------------
 * 
 * If your module has an Admin panel, and you'd like to give it a custom
 * icon, simply create a directory called "images" and place your icon in
 * that directory with the name "icon.gif" This is only guaranteed to work
 * with the default admin theme.
 * 
 * 5. Separation of Files
 * --------------
 * 
 * With the release of CMS Made Simple 0.12 or thereabouts, it became
 * possible to split a lot of the module functionality into separate files, rather
 * than requiring all of the module to be implemented in one big monolithic
 * chunk. This reduces the overall memory footprint of the module, which
 * becomes important for huge modules.
 * 
 * This is described in more detail below in the Separable Methods comment
 * as well as the comment for the DoAction.
 * 
 * Note that you do not have to split your module into multiple files. It's
 * your choice! If your module is small, it's probably not necessary. Then again,
 * good coding (for a noncompiled language, anyway) suggests that you don't
 * include a bunch of extraneous code each time your module loads. In the
 * end, it's your call.
 * 
 * 6. Events / Event Hooks
 * -----------------------
 * 
 * This is an exciting new feature that's been added to the CMS Made Simple
 * core. It allows modules to creat events, issue events, and subscribe to
 * events. What this does is enable an unprecedented degree of flexibility
 * and interaction between modules. You'll see elements of this sprinkled
 * throughout this file.
 * 
 * 7. Input parameter sanitazing
 * -----------------------------
 * 
 * Starting from 1.1 version of cmsms module developers are urged to take closer
 * look of what parameters their module accepts and how they are sanitazed.
 * 
 * Few new api functions are introduced, all parameters should be mapped for
 * everything to work smoothly. Use $this->SetParameterType('paramname',TYPE); 
 * to clean your input parameters (possible types are CLEAN_INT, CLEAN_STRING,
 * CLEAN_FLOAT, CLEAN_STRING)
 */


#-------------------------------------------------------------------------
# Module: Skeleton - a pedantic "starting point" module
# Version: 1.4, SjG
#
#-------------------------------------------------------------------------
# CMS - CMS Made Simple is (c) 2005 by Ted Kulp (wishy@cmsmadesimple.org)
# This project's homepage is: http://www.cmsmadesimple.org
# The module's homepage is: http://dev.cmsmadesimple.org/projects/skeleton/
#
#-------------------------------------------------------------------------
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 2 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
# You should have received a copy of the GNU General Public License
# along with this program; if not, write to the Free Software
# Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA 02111-1307 USA
# Or read it online: http://www.gnu.org/licenses/licenses.html#GPL
#
#-------------------------------------------------------------------------


#-------------------------------------------------------------------------
/**
 * Your initial Class declaration. This file's name must
 * be "[class's name].module.php", or, in this case,
 * Skeleton.module.php
 */ 


/**
 * Skeleton example class
 *
 * @author Your Name
 * @since 1.0
 * @version $Revision: 3827 $
 * @modifiedby $LastChangedBy: wishy $
 * @lastmodified $Date: 2007-03-12 11:56:16 +0200 (Mon, 12 Mar 2007) $
 * @license GPL
 **/
class syBOSApiCMS extends CMSModule
{

	/**
   * GetName()
   * must return the exact class name of the module.
   * If these do not match, bad things happen.
   *
   * This is the name that's shown in the main Modules
   * page in the Admin.
   *
   * If you want to be safe, you can just replace the body
   * of this function with:
   * return get_class($this); 
   * @return string class name
   */
	function GetName()
	{
		return 'syBOSApiCMS';
	}

	/**
   * GetFriendlyName()
   * This can return any string, preferably a localized name
   * of the module. This is the name that's shown in the
   * Admin Menus and section pages (if the module has an admin
   * component).
   *   
   * See the note on localization at the top of this file.
   * @return string Friendly name for the module
   */
	function GetFriendlyName()
	{
		return $this->Lang('syBOSApiCMS');
	}


	/**
   * GetVersion()
   * This can return any string, preferably a number or
   * something that makes sense for designating a version.
   * The CMS will use this to identify whether or not
   * the installed version of the module is current, and
   * the module will use it to figure out how to upgrade
   * itself if requested.	   
   * @return string version number (can be something like 1.4rc1)
   */
	function GetVersion()
	{
		return '0.1';
	}

	/**
   * GetHelp()
   * This returns HTML information on the module.
   * Typically, you'll want to include information on how to
   * use the module.
   *
   * See the note on localization at the top of this file.
   * @return string Help for this module
   */
	function GetHelp()
	{
		return $this->Lang('help');
	}

	/**
   * GetAuthor()
   * This returns a string that is presented in the Module
   * Admin if you click on the "About" link.
   * @return string Author name
   */
	function GetAuthor()
	{
		return 'SOLARYS Informatik GmbH';
	}

	/**
   * GetAuthorEmail()
   * This returns a string that is presented in the Module
   * Admin if you click on the "About" link. It helps users
   * of your module get in touch with you to send bug reports,
   * questions, cases of beer, and/or large sums of money.
   * @return string Authors email
   */
	function GetAuthorEmail()
	{
		return 'support@solarys.com';
	}

	/**
   * GetChangeLog()
   * This returns a string that is presented in the module
   * Admin if you click on the About link. It helps users
   * figure out what's changed between releases.
   * See the note on localization at the top of this file.
   * @return string ChangeLog for this module
   */
	function GetChangeLog()
	{
		return $this->Lang('changelog');
	}

	/**
   * IsPluginModule()
   * This function returns true or false, depending upon
   * whether users can include the module in a page or
   * template using a smarty tag of the form
   * {cms_module module='Skeleton' param1=val param2=val...}
   * 
   * If your module does not get included in pages or
   * templates, return "false" here.
   * @return bool True if this module can be included in page and or template
   */
	function IsPluginModule()
	{
		return true;
	}

	/**
   * HasAdmin()
   * This function returns a boolean value, depending on
   * whether your module adds anything to the Admin area of
   * the site. For the rest of these comments, I'll be calling
   * the admin part of your module the "Admin Panel" for
   * want of a better term.
   * @return bool True if this module has admin area
   */
	function HasAdmin()
	{
		return false;
	}

	/**
   * GetAdminSection()
   * If your module has an Admin Panel, you can specify
   * which Admin Section (or top-level Admin Menu) it shows
   * up in. This method returns a string to specify that
   * section. Valid return values are:
   * 
   * main        - the Main menu tab.
   * content     - the Content menu
   * layout      - the Layout menu
   * usersgroups - the Users and Groups menu
   * extensions  - the Extensions menu (this is the default)
   * siteadmin   - the Site Admin menu
   * viewsite    - the View Site menu tab
   * logout      - the Logout menu tab
   *
   * Note that if you place your module in the main,
   * viewsite, or logout sections, it will show up in the
   * menus, but will not be visible in any top-level
   * section pages.
   * @return string Which admin section this module belongs to
   */
	function GetAdminSection()
	{
		return 'extensions';
	}

	/**
   * GetAdminDescription()
   * If your module does have an Admin Panel, you
   * can have it return a description string that gets shown
   * in the Admin Section page that contains the module.
   *
   * See the note on localization at the top of this file.
   * @return string Module description
   */
	function GetAdminDescription()
	{
		return $this->Lang('moddescription');
	}

	/**
   * VisibleToAdminUser()
   * If your module does have an Admin Panel, you
   * can control whether or not it's displayed by the boolean
   * that is returned by this method. This is primarily used
   * to hide modules from admins who lack permission to use
   * them.
   * In this case, the module will only be visible to admins
   * who have "Use Skeleton" permissions.
   * @return bool True if this module is shown to current user
   */
	function VisibleToAdminUser()
	{
		return $this->CheckPermission('Use Skeleton');
	}

	/**
   * GetDependencies()
   * Your module may need another module to already be installed
   * before you can install it.
   * This method returns a list of those dependencies and
   * minimum version numbers that this module requires.
   *
   * It should return an hash, eg.
   * return array('somemodule'=>'1.0', 'othermodule'=>'1.1');
   * @return hash Hash of other modules this module depends on
   */
	function GetDependencies()
	{
		return array();
	}

	/**
   * MinimumCMSVersion()
   * Your module may require functions or objects from
   * a specific version of CMS Made Simple.
   * Ever since version 0.11, you can specify which minimum
   * CMS MS version is required for your module, which will
   * prevent it from being installed by a version of CMS that
   * can't run it.
   * 
   * This method returns a string representing the
   * minimum version that this module requires.
   * @return string Minimum cms version this module should work on
   */
	function MinimumCMSVersion()
	{
		return "1.0";
	}

	/**
   * MaximumCMSVersion()
   * You may want to prevent people from using your module in
   * future versions of CMS Made Simple, especially if you
   * think API features you use may change -- after all, you
   * never really know how the CMS MS API could evolve.
   * 
   * So, to prevent people from flooding you with bug reports
   * when a new version of CMS MS is released, you can simply
   * restrict the version. Then, of course, the onus is on you
   * to release a new version of your module when a new version
   * of the CMS is released...
   * 
   * This method returns a string representing the
   * maximum version that this module supports.
   */
	function MaximumCMSVersion()
	{
		return "2.0";
	}

	/**
   * SetParameters()
   * This function enables you to create mappings for
   * your module when using "Pretty Urls".
   * 
   * Typically, modules create internal links that have
   * big ugly strings along the lines of:
   * index.php?mact=ModName,cntnt01,actionName,0&cntnt01param1=1&cntnt01param2=2&cntnt01returnid=3
   * 
   * You might prefer these to look like:
   * /ModuleFunction/2/3
   * 
   * To do this, you have to register routes and map
   * your parameters in a way that the API will be able
   * to understand.
   *
   * Also note that any calls to CreateLink will need to
   * be updated to pass the pretty url parameter.
   * 
   * Since the Skeleton doesn't really create any links,
   * the section below is commented out, but you can
   * use it to figure out pretty urls.
   */ 

	function SetParameters()
	{
		/*
		//simple parameter
		$this->CreateParameter('skeleton', '', $this->lang('help_skeleton'));
		//map it for cleanup
		$this->SetParameterType('skeleton', CLEAN_STRING);

		// For viewing a picture
		$this->RegisterRoute('/skeleton\/(?P<numeric_param_name>[0-9]+)\/(?P<string_param_name>[a-zA-Z]+)\/(?P<returnid>[0-9]+)$/',
		array('action'=>'default'));

		// now, any url that looks like:
		//    /skeleton/3/foo/5
		// will call the default action, with:
		//     params['numeric_param_name'] set to 3
		//     params['string_param_name'] set to "foo"
		//    and returnid set to 5
		*/
	}

	/**
   * GetEventDescription()
   * If your module can create events, you will need
   * to provide the API with documentation of what
   * that event does. This method wraps up a simple
   * return of the localized description.
   * @param string Eventname
   * @return string Description for event 
   */
	function GetEventDescription ( $eventname )
	{
		return $this->Lang('event_info_'.$eventname );
	}

	/**
   * GetEventHelp()
   * If your module can create events, you will need
   * to provide the API with documentation of how to
   * use the event. This method wraps up a simple
   * return of the localized description.
   * @param string Eventname
   * @return string Help for event
   */
	function GetEventHelp ( $eventname )
	{
		return $this->Lang('event_help_'.$eventname );
	}

	/**
   * InstallPostMessage()
   * After installation, there may be things you want to
   * communicate to your admin. This function returns a
   * string which will be displayed.
   * 
   * See the note on localization at the top of this file.
   * @return string Message to be shown after installation
   */
	function InstallPostMessage()
	{
		return $this->Lang('postinstall');
	}

	/**
   * UninstallPostMessage()
   * After removing a module, there may be things you want to
   * communicate to your admin. This function returns a
   * string which will be displayed.
   *
   * See the note on localization at the top of this file.
   * @return string Message to be shown after uninstallation
   */
	function UninstallPostMessage()
	{
		return $this->Lang('postuninstall');
	}

	/**
   * UninstallPreMessage()
   * This allows you to display a message along with a Yes/No dialog box. If the user responds
   * in the affirmative to your message, the uninstall will proceed. If they respond in the
   * negative, the uninstall will be canceled. Thus, your message should be of the form
   * "All module data will be deleted. Are you sure you want to uninstall this module?"
   *
   * If you don't want the dialog, have this method return a FALSE, which will cause the
   * module to uninstall immediately if the user clicks the "uninstall" link.
   * @return string Message to be shown before uninstallation
   */
	function UninstallPreMessage()
	{
		return $this->Lang('really_uninstall');
	}

	/**
   * Your methods here
   * 
   * This would be a good place to define some general methods for your module
   * 
   * Its a good practice to have underscore in front of your own methods
   */
	function _SetStatus($oid, $status) {
		//...
	}

	/**
   * DoAction($action, $id, $params, $returnid)
   * This is the main function that gets called if your module
   * is a plug-in type module.
   * 
   * In general, you'll want to call various different
   * methods, depending upon the requested "action."
   *   
   * There are two built-in actions: "default" which gets
   * called if the module is accessed from a page or template,
   * and "defaultadmin" which gets called from the Admin
   * panel.
   *   
   * The Action can be overridden by passing a different
   * action either in your tag, e.g.,
   * {cms_module module='Skeleton' action='something'}
   * or by passing it in a link create by the CreateLink
   * method. 
   *
   * Similar to the Separable Methods described above,
   * you can actually remove all of the actions into separate
   * files as well. When the module API calls your module
   * with an action, it checks first to see if the DoAction method
   * exists. If it does, it gets used normally. If it doesn't exists,
   * the file corresponding to that method gets loaded and called.
   * 
   * For example, the default method would either be accessed
   * via the DoAction method being called with an action of 'default', or,
   * if no DoAction method exists in the module, the API would
   * execute the file named "action.default.php" in this module
   * directory.
   * 
   * As with the other Separable Methods above, I'm leaving
   * the methods in this main file, but commenting them out,
   * and doing the implementation in the separate files.
   * 
   * You can implement your module either way, 
   */
	function DoAction($action, $id, $params, $returnid=-1)
	{
		include("syBOSApiCMS.config.php");
		switch ($action) {
			case "listAbteilung":
				include("classes/SyXML.php");
				include("classes/SyList.php");
				include("abteilung/AbteilungView.php");

				$xmlFile = "$configApiUrl/xmlAbteilung.php?token=$configApiToken";
				$ObjView = new AbteilungView($xmlFile,$configPageCallAbteilung);
				if (!empty($params['lkz'])) {
					$ObjView->setFilterLkz($params['lkz']);
				}
				if (!empty($params['perpage'])) {
					$ObjView->setPerPage($params['perpage']);
				}				
				echo $ObjView->toHtml();
				break;
			case "listGeraet":
				include("classes/SyXML.php");
				include("classes/SyList.php");
				include("geraet/GeraetView.php");

				$xmlFile = "$configApiUrl/xmlGeraet.php?token=$configApiToken";
				$ObjView = new GeraetView($xmlFile,$configPageCallGeraet);
				if (!empty($params['perpage'])) {
					$ObjView->setPerPage($params['perpage']);
				}						
				$ObjView->setBilderLinkTpl('<a class="thickbox" rel="gallery-1" title="" href="{URL_MEDIUM}"><img src="{URL_THUMB}"/></a>');
				echo $ObjView->toHtml();
				break;
		}

		/*    switch ($action) {
		case 'default':
		{
		// this is the plug-in side, i.e., non-Admin
		$this->DisplayModuleOutput($action, $id, $params);
		break;
		}
		case 'defaultadmin':
		{
		// only let people access module preferences if they have permission
		if ($this->CheckPermission('Use Skeleton'))
		{
		$this->DisplayAdminPanel($id, $params, $returnid);
		}
		else
		{
		$this->DisplayErrorPage($id, $params, $returnid,
		$this->Lang('accessdenied'));
		}
		break;
		}
		case 'save_admin_prefs':
		{
		// only let people save module preferences if they have permission

		if ($this->CheckPermission('Use Skeleton'))
		{
		$this->SaveAdminPrefs($id, $params, $returnid);
		}
		break;
		}
		}*/
	}


} //end class
?>
