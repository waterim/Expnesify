import type {StackScreenProps} from '@react-navigation/stack';
import isEmpty from 'lodash/isEmpty';
import React, {useEffect, useMemo, useState} from 'react';
import {View} from 'react-native';
import type {OnyxCollection, OnyxEntry} from 'react-native-onyx';
import {withOnyx} from 'react-native-onyx';
import HeaderWithBackButton from '@components/HeaderWithBackButton';
import {usePersonalDetails} from '@components/OnyxProvider';
import ScreenWrapper from '@components/ScreenWrapper';
import SelectionList from '@components/SelectionList';
import UserListItem from '@components/SelectionList/UserListItem';
import useDebouncedState from '@hooks/useDebouncedState';
import useLocalize from '@hooks/useLocalize';
import useNetwork from '@hooks/useNetwork';
import useThemeStyles from '@hooks/useThemeStyles';
import type {MaybePhraseKey} from '@libs/Localize';
import Navigation from '@libs/Navigation/Navigation';
import type {RootStackParamList} from '@libs/Navigation/types';
import * as OptionsListUtils from '@libs/OptionsListUtils';
import Performance from '@libs/Performance';
import * as ReportUtils from '@libs/ReportUtils';
import * as Report from '@userActions/Report';
import Timing from '@userActions/Timing';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type SCREENS from '@src/SCREENS';
import type * as OnyxTypes from '@src/types/onyx';
import SearchPageFooter from './SearchPageFooter';

type SearchPageOnyxProps = {
    /** Beta features list */
    betas: OnyxEntry<OnyxTypes.Beta[]>;

    /** All reports shared with the user */
    reports: OnyxCollection<OnyxTypes.Report>;

    /** Whether or not we are searching for reports on the server */
    isSearchingForReports: OnyxEntry<boolean>;
};

type SearchPageProps = SearchPageOnyxProps & StackScreenProps<RootStackParamList, typeof SCREENS.SEARCH_ROOT>;

type Options = OptionsListUtils.GetOptions & {headerMessage: string};

type SearchPageSectionItem = {
    data: ReportUtils.OptionData[];
    shouldShow: boolean;
    indexOffset: number;
};

type SearchPageSectionList = SearchPageSectionItem[];

const setPerformanceTimersEnd = () => {
    Timing.end(CONST.TIMING.SEARCH_RENDER);
    Performance.markEnd(CONST.TIMING.SEARCH_RENDER);
};

const SearchPageFooterInstance = <SearchPageFooter />;

function SearchPage({betas, reports, isSearchingForReports, navigation}: SearchPageProps) {
    const [isScreenTransitionEnd, setIsScreenTransitionEnd] = useState(false);
    const {translate} = useLocalize();
    const {isOffline} = useNetwork();
    const themeStyles = useThemeStyles();
    const personalDetails = usePersonalDetails();

    const offlineMessage: MaybePhraseKey = isOffline ? [`${translate('common.youAppearToBeOffline')} ${translate('search.resultsAreLimited')}`, {isTranslated: true}] : '';

    const [searchValue, debouncedSearchValue, setSearchValue] = useDebouncedState('');

    useEffect(() => {
        Timing.start(CONST.TIMING.SEARCH_RENDER);
        Performance.markStart(CONST.TIMING.SEARCH_RENDER);
    }, []);

    useEffect(() => {
        Report.searchInServer(debouncedSearchValue.trim());
    }, [debouncedSearchValue]);

    const searchOptions: Options = useMemo(() => {
        if (!isScreenTransitionEnd) {
            return {
                recentReports: [],
                personalDetails: [],
                userToInvite: null,
                currentUserOption: null,
                categoryOptions: [],
                tagOptions: [],
                taxRatesOptions: [],
                headerMessage: '',
            };
        }
        const options = OptionsListUtils.getSearchOptions(reports, personalDetails, '', betas ?? []);
        const header = OptionsListUtils.getHeaderMessage(options.recentReports.length + options.personalDetails.length !== 0, Boolean(options.userToInvite), '');
        return {...options, headerMessage: header};
    }, [betas, isScreenTransitionEnd, personalDetails, reports]);

    const filteredOptions = useMemo(() => {
        if (debouncedSearchValue.trim() === '') {
            return {
                recentReports: [],
                personalDetails: [],
                userToInvite: null,
                headerMessage: '',
            };
        }

        const options = OptionsListUtils.filterOptions(searchOptions, debouncedSearchValue);
        const header = OptionsListUtils.getHeaderMessage(options.recentReports.length > 0, false, debouncedSearchValue);
        return {
            recentReports: options.recentReports,
            personalDetails: options.personalDetails,
            userToInvite: null,
            headerMessage: header,
        };
    }, [searchOptions, debouncedSearchValue]);

    const {recentReports, personalDetails: localPersonalDetails, userToInvite, headerMessage} = debouncedSearchValue.trim() !== '' ? filteredOptions : searchOptions;

    const sections = useMemo((): SearchPageSectionList => {
        const newSections: SearchPageSectionList = [];
        let indexOffset = 0;

        if (recentReports?.length > 0) {
            newSections.push({
                data: recentReports.map((report) => ({...report, isBold: report.isUnread})),
                shouldShow: true,
                indexOffset,
            });
            indexOffset += recentReports.length;
        }

        if (localPersonalDetails.length > 0) {
            newSections.push({
                data: localPersonalDetails,
                shouldShow: true,
                indexOffset,
            });
            indexOffset += recentReports.length;
        }

        if (!isEmpty(userToInvite)) {
            newSections.push({
                data: [userToInvite],
                shouldShow: true,
                indexOffset,
            });
        }

        return newSections;
    }, [localPersonalDetails, recentReports, userToInvite]);

    const selectReport = (option: ReportUtils.OptionData) => {
        if (!option) {
            return;
        }

        if (option.reportID) {
            setSearchValue('');
            Navigation.dismissModal(option.reportID);
        } else {
            Report.navigateToAndOpenReport(option.login ? [option.login] : []);
        }
    };

    const handleScreenTransitionEnd = () => {
        setIsScreenTransitionEnd(true);
    };

    const isOptionsDataReady = useMemo(() => ReportUtils.isReportDataReady() && OptionsListUtils.isPersonalDetailsReady(personalDetails), [personalDetails]);

    return (
        <ScreenWrapper
            includeSafeAreaPaddingBottom={false}
            testID={SearchPage.displayName}
            onEntryTransitionEnd={handleScreenTransitionEnd}
            shouldEnableMaxHeight
            navigation={navigation}
        >
            {({didScreenTransitionEnd, safeAreaPaddingBottomStyle}) => (
                <>
                    <HeaderWithBackButton
                        title={translate('common.search')}
                        onBackButtonPress={Navigation.goBack}
                    />
                    <View style={[themeStyles.flex1, themeStyles.w100, safeAreaPaddingBottomStyle]}>
                        <SelectionList<ReportUtils.OptionData>
                            sections={didScreenTransitionEnd && isOptionsDataReady ? sections : CONST.EMPTY_ARRAY}
                            ListItem={UserListItem}
                            textInputValue={searchValue}
                            textInputLabel={translate('optionsSelector.nameEmailOrPhoneNumber')}
                            textInputHint={offlineMessage}
                            onChangeText={setSearchValue}
                            headerMessage={headerMessage}
                            onLayout={setPerformanceTimersEnd}
                            autoFocus
                            onSelectRow={selectReport}
                            showLoadingPlaceholder={!didScreenTransitionEnd || !isOptionsDataReady}
                            footerContent={SearchPageFooterInstance}
                            isLoadingNewOptions={isSearchingForReports ?? undefined}
                        />
                    </View>
                </>
            )}
        </ScreenWrapper>
    );
}

SearchPage.displayName = 'SearchPage';

export default withOnyx<SearchPageProps, SearchPageOnyxProps>({
    reports: {
        key: ONYXKEYS.COLLECTION.REPORT,
    },
    betas: {
        key: ONYXKEYS.BETAS,
    },
    isSearchingForReports: {
        key: ONYXKEYS.IS_SEARCHING_FOR_REPORTS,
        initWithStoredValues: false,
    },
})(SearchPage);
